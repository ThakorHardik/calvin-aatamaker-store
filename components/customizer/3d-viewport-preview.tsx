"use client";

import { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Rotate3d,
  RotateCcw,
  Compass,
  Layers,
  Lock,
  LoaderCircle,
} from "lucide-react";
import type {
  Product3DModel,
  ProductPrintableSurface,
  CanvasLayer,
  PhotoLayer,
  TextLayer,
} from "@/types/3d-model";

interface ViewportPreviewProps {
  model: Product3DModel | null;
  surface: ProductPrintableSurface | null;
  layers: CanvasLayer[];
}

import { renderCanonicalFlatArtworkDataUrl } from "@/lib/3d/canonical-artwork";
import { resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";

// Canonical canvas texture resolution for 380mm x 620mm surface
const CANVAS_TEX_W = 1024;
const CANVAS_TEX_H = 1670;

export interface ViewportPreviewHandle {
  capture3DSnapshot: () => Promise<string>;
  captureFlatArtworkSnapshot: () => Promise<string>;
  updateTexture: () => void;
}

export const ViewportPreview = forwardRef<ViewportPreviewHandle, ViewportPreviewProps>(
  function ViewportPreview(
    {
      model,
      surface,
      layers,
    },
    ref
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loadingModel, setLoadingModel] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>("perspective");

  // Three.js instances stored in refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Object3D | null>(null);
  const frontPrintMeshRef = useRef<THREE.Mesh | null>(null);
  const printTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Cached loaded images for texture rasterization
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Physical specifications: Use approved prototype dimensions (480 x 340 x 880 mm)
  const dims = model?.dimensions_mm || { width: 480, height: 880, depth: 340 };
  const targetCenter = useMemo(() => new THREE.Vector3(0, 0.440, 0), []);

  // ---------------------------------------------------------------------------
  // 1. Offscreen Canvas Texture Rasterization from 2D Layers
  // ---------------------------------------------------------------------------
  const updateFrontSurfaceTexture = useCallback(() => {
    if (!frontPrintMeshRef.current || !offscreenCanvasRef.current) return;

    const cvs = offscreenCanvasRef.current;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // Reset & fill base neutral dark coat
    ctx.fillStyle = "#18181C";
    ctx.fillRect(0, 0, CANVAS_TEX_W, CANVAS_TEX_H);

    // Subtle edge guideline / safe-margin tint (for visual orientation)
    ctx.strokeStyle = "#2A2A32";
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, CANVAS_TEX_W - 60, CANVAS_TEX_H - 60);

    // Sort layers by zIndex
    const sortedLayers = [...layers]
      .filter((l) => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1.0;

      // Coordinate mapping from normalized 0..1 to canvas pixels
      const lx = layer.x * CANVAS_TEX_W;
      const ly = layer.y * CANVAS_TEX_H;
      const lw = layer.width * CANVAS_TEX_W;
      const lh = layer.height * CANVAS_TEX_H;

      // Center of element for rotation
      const cx = lx + lw / 2;
      const cy = ly + lh / 2;

      ctx.translate(cx, cy);
      if (layer.rotationDeg) {
        ctx.rotate((layer.rotationDeg * Math.PI) / 180);
      }

      if (layer.type === "photo") {
        const photo = layer as PhotoLayer;
        const effectiveUrl =
          resolveCustomizationAssetUrl(photo.storagePath || photo.imageUrl) || photo.imageUrl;
        const cachedImg = imageElementCache.current.get(effectiveUrl);

        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          if (photo.crop) {
            const sx = Math.max(0, photo.crop.x * cachedImg.naturalWidth);
            const sy = Math.max(0, photo.crop.y * cachedImg.naturalHeight);
            const sw = Math.min(cachedImg.naturalWidth - sx, photo.crop.width * cachedImg.naturalWidth);
            const sh = Math.min(cachedImg.naturalHeight - sy, photo.crop.height * cachedImg.naturalHeight);
            ctx.drawImage(cachedImg, sx, sy, sw, sh, -lw / 2, -lh / 2, lw, lh);
          } else {
            ctx.drawImage(cachedImg, -lw / 2, -lh / 2, lw, lh);
          }
        } else if (!cachedImg && effectiveUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = effectiveUrl;
          img.onload = () => {
            imageElementCache.current.set(effectiveUrl, img);
            updateFrontSurfaceTexture();
          };
          img.onerror = () => {
            console.warn("Failed to load photo texture in 3D viewport preview:", effectiveUrl);
          };
          imageElementCache.current.set(effectiveUrl, img);
        }
      } else if (layer.type === "text") {
        const textL = layer as TextLayer;
        const scaledFontSize = Math.max(
          14,
          (textL.fontSizePt || 28) * (CANVAS_TEX_H / 700)
        );
        const fontStyle = textL.fontWeight === "bold" ? "bold" : "normal";
        const fontFamily = textL.fontFamily || "sans-serif";

        ctx.font = `${fontStyle} ${scaledFontSize}px ${fontFamily}`;
        ctx.fillStyle = textL.fillColorHex || "#FFFFFF";
        ctx.textAlign = textL.textAlign || "center";
        ctx.textBaseline = "middle";

        ctx.fillText(textL.text || "", 0, 0);
      }

      ctx.restore();
    }

    if (printTextureRef.current) {
      printTextureRef.current.needsUpdate = true;
    }
  }, [layers]);

  // Update texture whenever layers change
  useEffect(() => {
    updateFrontSurfaceTexture();
  }, [updateFrontSurfaceTexture]);

  // ---------------------------------------------------------------------------
  // 2. Initialize Three.js Scene, Camera, Studio Lighting, Controls
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Create offscreen canvas for texture mapping
    if (!offscreenCanvasRef.current) {
      const oc = document.createElement("canvas");
      oc.width = CANVAS_TEX_W;
      oc.height = CANVAS_TEX_H;
      offscreenCanvasRef.current = oc;
    }

    // 1. Scene with warm ivory / subtle light beige backdrop
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#F5F3EF");
    sceneRef.current = scene;

    // 2. Camera: 35deg FOV for natural product photography without fisheye distortion
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 50);
    // Initial isometric 3/4 position: 45° angle, viewing front & right side
    camera.position.set(1.4, 0.75, 1.6);
    camera.lookAt(targetCenter);
    cameraRef.current = camera;

    // 3. Renderer with ACES Filmic tone mapping & soft shadow maps
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 4. OrbitControls: 360-degree rotation with damping & polar constraints
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(targetCenter);
    controls.minDistance = 0.75;
    controls.maxDistance = 2.6;
    // Constrain polar angle: prevents viewing inside bottom or directly vertical overhead
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.52;
    controlsRef.current = controls;

    // 5. Enhanced Multi-Point Studio Lighting Setup
    // Soft Ambient Base
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    // Warm Directional Key Light (Front-right-high with soft shadows)
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.9);
    keyLight.position.set(1.6, 2.5, 2.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 6.0;
    keyLight.shadow.camera.left = -0.8;
    keyLight.shadow.camera.right = 0.8;
    keyLight.shadow.camera.top = 1.2;
    keyLight.shadow.camera.bottom = -0.2;
    keyLight.shadow.bias = -0.0002;
    scene.add(keyLight);

    // Cool Fill Light (Front-left)
    const fillLight = new THREE.DirectionalLight(0xe8f0fe, 1.0);
    fillLight.position.set(-2.0, 1.4, 1.4);
    scene.add(fillLight);

    // Left Edge / Rim Light (Defines black chassis contour against ivory backdrop)
    const rimLeftLight = new THREE.DirectionalLight(0xffffff, 1.4);
    rimLeftLight.position.set(-1.8, 2.2, -1.8);
    scene.add(rimLeftLight);

    // Right Edge / Rim Light (Defines right chassis corner and handle bevel)
    const rimRightLight = new THREE.DirectionalLight(0xffffff, 1.4);
    rimRightLight.position.set(1.8, 2.2, -1.8);
    scene.add(rimRightLight);

    // Overhead Subtle Highlight (Top lid and hopper definition)
    const topLight = new THREE.DirectionalLight(0xfffbf2, 0.65);
    topLight.position.set(0, 3.2, 0);
    scene.add(topLight);

    // Soft Natural Ground Shadow Receiver Plane
    const groundGeo = new THREE.PlaneGeometry(3.5, 3.5);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.ShadowMaterial({
      opacity: 0.16,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.position.set(0, 0, 0);
    scene.add(ground);

    // 6. Create CanvasTexture for dynamic customer artwork (flipY: false for glTF UV alignment)
    const printTexture = new THREE.CanvasTexture(offscreenCanvasRef.current);
    printTexture.colorSpace = THREE.SRGBColorSpace;
    printTexture.flipY = false;
    printTextureRef.current = printTexture;

    // 7. Load GLB Model (Prototype fallback: /models/calvin-compact-01-prototype.glb)
    const modelUrl =
      model?.glb_storage_path && model.status === "published"
        ? model.glb_storage_path
        : "/models/calvin-compact-01-prototype.glb";

    setLoadingModel(true);
    setLoadError(null);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const root = gltf.scene;
        modelRootRef.current = root;
        scene.add(root);

        // Identify Front_Print_Surface and apply CanvasTexture
        root.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.name === "Front_Print_Surface") {
              frontPrintMeshRef.current = mesh;
              mesh.material = new THREE.MeshStandardMaterial({
                map: printTexture,
                roughness: 0.35,
                metalness: 0.05,
              });
            }

            // Fixed CALVIN Company Branding
            if (mesh.name === "Calvin_Fixed_Logo") {
              new THREE.TextureLoader().load(
                "/images/calvin-aatamaker-logo.png",
                (tex) => {
                  tex.colorSpace = THREE.SRGBColorSpace;
                  mesh.material = new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    roughness: 0.2,
                    metalness: 0.1,
                    depthWrite: false,
                  });
                }
              );
            }
          }
        });

        // Trigger first texture rasterization
        updateFrontSurfaceTexture();
        setLoadingModel(false);
      },
      undefined,
      (err) => {
        console.error("Failed to load 3D prototype GLB:", err);
        setLoadError("Unable to load 3D prototype asset. Using fallback preview.");
        setLoadingModel(false);
      }
    );

    // 8. Animation & Render Loop
    let isRunning = true;
    const animate = () => {
      if (!isRunning) return;
      animFrameIdRef.current = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 10. Clean-up on unmount
    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      if (printTextureRef.current) {
        printTextureRef.current.dispose();
      }
    };
  }, [model, targetCenter, updateFrontSurfaceTexture]);

  // ---------------------------------------------------------------------------
  // 3. Camera Preset Controls
  // ---------------------------------------------------------------------------
  const setCameraPreset = (preset: "front" | "perspective" | "right" | "left") => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    setActivePreset(preset);

    if (preset === "front") {
      camera.position.set(0, 0.440, 2.1);
    } else if (preset === "perspective") {
      camera.position.set(1.4, 0.75, 1.6);
    } else if (preset === "right") {
      camera.position.set(2.0, 0.440, 0);
    } else if (preset === "left") {
      camera.position.set(-2.0, 0.440, 0);
    }
    controls.target.copy(targetCenter);
    controls.update();
  };

  const resetCamera = () => {
    setCameraPreset("perspective");
  };

  // ---------------------------------------------------------------------------
  // 4. Imperative Handle: High-Fidelity 3D WebGL Snapshot Capture
  // ---------------------------------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      capture3DSnapshot: async (): Promise<string> => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!renderer || !scene || !camera) {
          throw new Error("3D Scene or Renderer is not initialized");
        }

        // Wait for all photo layers' images to be fully loaded
        const photoLayers = layers.filter((l) => l.visible && l.type === "photo") as PhotoLayer[];
        await Promise.all(
          photoLayers.map((pl) => {
            return new Promise<void>((resolve) => {
              const effectiveUrl =
                resolveCustomizationAssetUrl(pl.storagePath || pl.imageUrl) || pl.imageUrl;
              const cached = imageElementCache.current.get(effectiveUrl);
              if (cached && cached.complete && cached.naturalWidth > 0) {
                resolve();
              } else {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                  imageElementCache.current.set(effectiveUrl, img);
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = effectiveUrl;
              }
            });
          })
        );

        // Update front surface texture with exact photo, crop, and text layers
        updateFrontSurfaceTexture();
        if (printTextureRef.current) {
          printTextureRef.current.needsUpdate = true;
        }

        // Remember user's current camera angle
        const prevPos = camera.position.clone();

        // Frame machine in canonical 3/4 beauty view
        camera.position.set(1.4, 0.75, 1.6);
        camera.lookAt(targetCenter);
        if (controls) {
          controls.target.copy(targetCenter);
          controls.update();
        }

        // Force synchronous render pass
        renderer.render(scene, camera);

        // Read pixel-perfect WebGL canvas as PNG
        const dataUrl = renderer.domElement.toDataURL("image/png");

        // Restore camera
        camera.position.copy(prevPos);
        camera.lookAt(targetCenter);
        if (controls) {
          controls.target.copy(targetCenter);
          controls.update();
        }

        return dataUrl;
      },
      captureFlatArtworkSnapshot: async (): Promise<string> => {
        return renderCanonicalFlatArtworkDataUrl(layers, {
          imageElementGetter: (url) => imageElementCache.current.get(url) || null,
        });
      },
      updateTexture: () => {
        updateFrontSurfaceTexture();
      },
    }),
    [layers, targetCenter, updateFrontSurfaceTexture]
  );

  const printableWidth = surface?.physical_width_mm || 380;
  const printableHeight = surface?.physical_height_mm || 620;

  return (
    <div className="relative rounded-2xl border border-stone-300 bg-[#F5F3EF] min-h-[460px] sm:min-h-[520px] flex flex-col justify-between overflow-hidden shadow-xl">
      {/* Top Header Bar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 bg-white/85 backdrop-blur-md border-b border-stone-200/90 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            <Rotate3d size={13} className="text-amber-600" />
            360° Interactive Orbit
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-mono text-stone-700 border border-stone-200">
            CALVIN-COMPACT-01
          </span>
        </div>

        {/* Camera View Angle Buttons */}
        <div className="flex items-center gap-1 bg-stone-100/90 p-1 rounded-xl border border-stone-200">
          <button
            type="button"
            onClick={() => setCameraPreset("front")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              activePreset === "front"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("perspective")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              activePreset === "perspective"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            3/4 View
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("right")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              activePreset === "right"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Right
          </button>
          <button
            type="button"
            onClick={resetCamera}
            title="Reset Camera"
            className="p-1 rounded-lg text-stone-500 hover:text-amber-700 hover:bg-stone-200 transition-all"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full min-h-[360px] sm:min-h-[420px] flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Loading Indicator */}
        {loadingModel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/75 backdrop-blur-xs z-20">
            <LoaderCircle size={32} className="animate-spin text-amber-500 mb-2" />
            <p className="text-xs font-semibold text-stone-200">
              Loading CALVIN-COMPACT-01 3D Prototype...
            </p>
            <p className="text-[10px] text-stone-400 font-mono mt-1">
              Rendering PBR metallic-roughness materials
            </p>
          </div>
        )}

        {/* Load Error Fallback */}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/85 p-6 text-center z-20">
            <p className="text-xs text-rose-300 font-semibold">{loadError}</p>
          </div>
        )}

        {/* Fixed CALVIN Branding Shield Badge Indicator */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-medium text-stone-700 backdrop-blur-xs border border-stone-200 shadow-xs">
          <Lock size={11} className="text-amber-600" />
          <span>Fixed CALVIN Badge (Upper Door)</span>
        </div>

        {/* Interaction Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-full bg-white/80 px-3 py-1 text-[10px] text-stone-600 backdrop-blur-xs border border-stone-200 shadow-xs hidden sm:block">
          Drag to orbit 360° • Scroll to zoom • Right-click to pan
        </div>
      </div>

      {/* Footer Info & Verification Bar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4 bg-white/90 border-t border-stone-200 text-[11px] text-stone-600">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-stone-800 font-mono font-medium">
            <Compass size={12} className="text-amber-600" />
            {dims.width} × {dims.depth} × {dims.height} mm
          </span>
          <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
            Provisional Prototype Dimensions
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-stone-800 inline-flex items-center gap-1">
            <Layers size={12} className="text-amber-600" />
            {layers.filter((l) => l.visible).length} layers projected
          </span>
          <span className="text-stone-500 text-[10px]">
            Door Print Area: {printableWidth} × {printableHeight} mm
          </span>
        </div>
      </div>
    </div>
  );
});
