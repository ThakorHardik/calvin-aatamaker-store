"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Rotate3d,
  AlertCircle,
  LoaderCircle,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { resolveCustomizationAssetUrl, isPermanentStoragePath } from "@/lib/3d/storage-assets";
import type { CanvasLayer, PhotoLayer, TextLayer } from "@/types/3d-model";

const CANVAS_TEX_W = 1024;
const CANVAS_TEX_H = 1670; // 380 mm x 620 mm aspect ratio
const TARGET_CENTER = new THREE.Vector3(0, 0.44, 0); // Fixed focal target: center of compact machine (height ~0.88m -> Y: ~0.44m)

export type ViewerStage =
  | "initializing"
  | "loading_glb"
  | "loading_artwork"
  | "applying_texture"
  | "rendering_frame"
  | "ready"
  | "error";

interface ViewerStatus {
  stage: ViewerStage;
  message: string;
  progressPercent: number;
  error?: string | null;
}

interface Interactive3DOrderViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  productName: string;
  modelCode?: string;
  surfaceDimensionsMm?: { width: number; height: number };
  layers: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  mode?: string;
  artworkUrl?: string;
}

export function Interactive3DOrderViewerModal({
  isOpen,
  onClose,
  orderNumber,
  productName,
  modelCode = "CALVIN-COMPACT-01",
  surfaceDimensionsMm = { width: 380, height: 620 },
  layers,
  options = {},
  mode = "demonstration",
  artworkUrl,
}: Interactive3DOrderViewerModalProps) {
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePreset, setActivePreset] = useState<"beauty" | "front" | "side">("beauty");
  const [retryTrigger, setRetryTrigger] = useState(0);

  const [status, setStatus] = useState<ViewerStatus>({
    stage: "initializing",
    message: "Initializing 3D Viewport...",
    progressPercent: 5,
  });

  // Three.js instances stored in refs to prevent recreation loops
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const frontPrintMeshRef = useRef<THREE.Mesh | null>(null);
  const printTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Normalize layers into typed CanvasLayer format with resolved fresh asset URLs
  const normalizedLayers: CanvasLayer[] = useMemo(() => {
    return (layers || []).map((l, index) => {
      const type = typeof l.type === "string" ? l.type : "photo";
      const storagePath = (l.storagePath as string) || (l.assetPath as string) || "";
      const rawUrl =
        storagePath && isPermanentStoragePath(storagePath)
          ? storagePath
          : storagePath || (l.imageUrl as string) || "";
      const resolvedUrl = rawUrl ? resolveCustomizationAssetUrl(rawUrl) : "";

      if (type === "photo" || type === "image") {
        const pLayer: PhotoLayer = {
          id: (l.id as string) || `layer_${index}`,
          type: "photo",
          name: (l.name as string) || `Photograph ${index + 1}`,
          x: typeof l.x === "number" ? l.x : 0,
          y: typeof l.y === "number" ? l.y : 0,
          width: typeof l.width === "number" ? l.width : 1,
          height: typeof l.height === "number" ? l.height : 1,
          rotationDeg:
            typeof l.rotation === "number"
              ? l.rotation
              : typeof l.rotationDeg === "number"
                ? l.rotationDeg
                : 0,
          opacity: typeof l.opacity === "number" ? l.opacity : 1,
          zIndex: typeof l.order === "number" ? l.order : index,
          visible: l.visible !== false,
          imageUrl: resolvedUrl,
          storagePath: (l.storagePath as string) || "",
          sourceWidthPx: Number(l.sourceWidthPx) || 1024,
          sourceHeightPx: Number(l.sourceHeightPx) || 1024,
          crop:
            l.crop && typeof l.crop === "object"
              ? (l.crop as { x: number; y: number; width: number; height: number })
              : undefined,
          filterPreset: (l.filterPreset as "none" | "warm" | "grayscale" | "sepia") || "none",
          locked: Boolean(l.locked),
        };
        return pLayer;
      }

      const tLayer: TextLayer = {
        id: (l.id as string) || `text_${index}`,
        type: "text",
        name: (l.name as string) || `Text "${String(l.text || "").slice(0, 10)}"`,
        text: typeof l.text === "string" ? l.text : "",
        fontFamily: typeof l.fontFamily === "string" ? l.fontFamily : "Cinzel, serif",
        fontSizePt: typeof l.fontSize === "number" ? l.fontSize : 28,
        fontWeight: (l.fontWeight === "normal" ? "normal" : "bold") as "normal" | "bold",
        fillColorHex:
          (l.color as string) || (l.fill as string) || (l.fillColorHex as string) || "#b45309",
        textAlign: (
          (l.align as string) || (l.textAlign as string) || "center"
        ).toLowerCase() as "left" | "center" | "right",
        x: typeof l.x === "number" ? l.x : 0.08,
        y: typeof l.y === "number" ? l.y : 0.12,
        width: typeof l.width === "number" ? l.width : 0.6,
        height: typeof l.height === "number" ? l.height : 0.08,
        rotationDeg:
          typeof l.rotation === "number"
            ? l.rotation
            : typeof l.rotationDeg === "number"
              ? l.rotationDeg
              : 0,
        opacity: typeof l.opacity === "number" ? l.opacity : 1,
        zIndex: typeof l.order === "number" ? l.order : index,
        visible: l.visible !== false,
        locked: Boolean(l.locked),
      };
      return tLayer;
    });
  }, [layers]);

  // Preload all customer photograph assets asynchronously with timeout
  const preloadCustomerImages = useCallback(async (): Promise<void> => {
    const photoLayers = normalizedLayers.filter(
      (l) => l.visible && l.type === "photo" && (l as PhotoLayer).imageUrl
    ) as PhotoLayer[];

    if (photoLayers.length === 0) return;

    const loadPromises = photoLayers.map((layer) => {
      const url = layer.imageUrl;
      if (!url) return Promise.resolve();

      // Check if already in cache
      const cached = imageElementCache.current.get(url);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        let timer: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          img.onload = null;
          img.onerror = null;
        };

        img.onload = () => {
          cleanup();
          imageElementCache.current.set(url, img);
          resolve();
        };

        img.onerror = (e) => {
          cleanup();
          console.warn(`[3D Viewer] Warning: Failed to load photo layer image from ${url}`, e);
          resolve(); // Resolve anyway so viewer still renders typography and chassis
        };

        timer = setTimeout(() => {
          cleanup();
          console.warn(`[3D Viewer] Timeout preloading photo layer from ${url}`);
          resolve();
        }, 12000);

        img.src = url;
      });
    });

    await Promise.allSettled(loadPromises);
  }, [normalizedLayers]);

  // Render front panel canvas texture from the single canonical artwork source
  const renderDoorTexture = useCallback(async (): Promise<void> => {
    if (!offscreenCanvasRef.current) return;
    const cvs = offscreenCanvasRef.current;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let canonicalDataUrl = artworkUrl || "";

    // If artworkUrl is not provided, generate it on-the-fly using the canonical renderer
    if (!canonicalDataUrl && normalizedLayers.length > 0) {
      await preloadCustomerImages();
      const { renderCanonicalFlatArtworkDataUrl } = await import("@/lib/3d/canonical-artwork");
      canonicalDataUrl = await renderCanonicalFlatArtworkDataUrl(normalizedLayers, {
        finish: (options.front_panel_finish as string) || "matte_black",
        includeBranding: true,
        imageElementGetter: (url) => imageElementCache.current.get(url),
      });
    }

    if (canonicalDataUrl) {
      const img = new Image();
      if (!canonicalDataUrl.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Timeout loading canonical flat artwork texture image"));
        }, 15000);

        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = (e) => {
          clearTimeout(timer);
          reject(new Error("Failed to load canonical flat artwork texture: " + String(e)));
        };
        img.src = canonicalDataUrl;
      });

      await img.decode().catch(() => {});

      ctx.clearRect(0, 0, CANVAS_TEX_W, CANVAS_TEX_H);
      ctx.drawImage(img, 0, 0, CANVAS_TEX_W, CANVAS_TEX_H);
    } else {
      // Fallback base coat gradient if no artwork is available
      const finish = (options.front_panel_finish as string) || "matte_black";
      let cTop = "#1D1D22";
      let cBottom = "#131317";
      if (finish === "brushed_silver") {
        cTop = "#2D3139";
        cBottom = "#202227";
      } else if (finish === "champagne_gold") {
        cTop = "#2C261F";
        cBottom = "#1D1914";
      } else if (finish === "rose_copper") {
        cTop = "#2C1F1F";
        cBottom = "#1B1313";
      }

      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_TEX_H);
      grad.addColorStop(0, cTop);
      grad.addColorStop(1, cBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_TEX_W, CANVAS_TEX_H);
    }

    if (printTextureRef.current) {
      printTextureRef.current.needsUpdate = true;
    }
  }, [artworkUrl, normalizedLayers, options.front_panel_finish, preloadCustomerImages]);

  const renderDoorTextureRef = useRef(renderDoorTexture);
  renderDoorTextureRef.current = renderDoorTexture;

  // Main Three.js Scene Lifecycle
  useEffect(() => {
    if (!isOpen) return;
    isMountedRef.current = true;

    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    setStatus({
      stage: "initializing",
      message: "Initializing Three.js WebGL Engine...",
      progressPercent: 15,
    });

    // Create offscreen canvas for front door texture
    if (!offscreenCanvasRef.current) {
      const oc = document.createElement("canvas");
      oc.width = CANVAS_TEX_W;
      oc.height = CANVAS_TEX_H;
      offscreenCanvasRef.current = oc;
    }

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#F4F2EE");
    sceneRef.current = scene;

    // 2. Camera setup: 35° FOV for realistic product focal length
    const initialWidth = container.clientWidth || 800;
    const initialHeight = container.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(
      35,
      initialWidth / initialHeight,
      0.1,
      50
    );
    // Initial Three-Quarter Beauty framing
    camera.position.set(1.25, 0.65, 1.35);
    camera.lookAt(TARGET_CENTER);
    cameraRef.current = camera;

    // 3. WebGLRenderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      renderer.setSize(initialWidth, initialHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      rendererRef.current = renderer;
    } catch (glErr) {
      console.error("[3D Viewer] WebGL initialization failed:", glErr);
      if (isMountedRef.current) {
        setStatus({
          stage: "error",
          message: "WebGL initialization failed. Please ensure hardware acceleration is enabled.",
          progressPercent: 0,
          error: String(glErr),
        });
      }
      return;
    }

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(TARGET_CENTER);
    controls.minDistance = 0.75;
    controls.maxDistance = 2.8;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.52; // Prevent seeing strictly beneath ground
    controlsRef.current = controls;

    // 5. Studio Multi-Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

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

    const fillLight = new THREE.DirectionalLight(0xe8f0fe, 1.0);
    fillLight.position.set(-2.0, 1.4, 1.4);
    scene.add(fillLight);

    const rimLeftLight = new THREE.DirectionalLight(0xffffff, 1.4);
    rimLeftLight.position.set(-1.8, 2.2, -1.8);
    scene.add(rimLeftLight);

    const rimRightLight = new THREE.DirectionalLight(0xffffff, 1.4);
    rimRightLight.position.set(1.8, 2.2, -1.8);
    scene.add(rimRightLight);

    const topLight = new THREE.DirectionalLight(0xfffbf2, 0.65);
    topLight.position.set(0, 3.2, 0);
    scene.add(topLight);

    // Ground Shadow Receiver Plane
    const groundGeo = new THREE.PlaneGeometry(3.5, 3.5);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.position.set(0, 0, 0);
    scene.add(ground);

    // 6. Canvas Texture for Front Printable Surface
    const printTexture = new THREE.CanvasTexture(offscreenCanvasRef.current);
    printTexture.colorSpace = THREE.SRGBColorSpace;
    printTexture.flipY = false;
    printTextureRef.current = printTexture;

    // 7. Load GLB Model & Customer Assets sequentially
    const modelUrl = "/models/calvin-compact-01-prototype.glb";
    setStatus({
      stage: "loading_glb",
      message: "Loading Physical Prototype (CALVIN-COMPACT-01)...",
      progressPercent: 35,
    });

    let isDisposed = false;
    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      async (gltf) => {
        if (isDisposed || !isMountedRef.current) return;

        const root = gltf.scene;
        modelRootRef.current = root;
        scene.add(root);

        // Identify Front_Print_Surface and apply CanvasTexture
        let foundPrintSurface = false;
        root.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.name === "Front_Print_Surface") {
              foundPrintSurface = true;
              frontPrintMeshRef.current = mesh;
              mesh.material = new THREE.MeshStandardMaterial({
                map: printTexture,
                roughness: 0.35,
                metalness: 0.05,
              });
            }

            // Fixed CALVIN Brand Emblem Mesh
            if (mesh.name === "Calvin_Fixed_Logo") {
              // Hide physical logo mesh so the canonical flat artwork on Front_Print_Surface provides the exact single brand logo plate
              mesh.visible = false;
            }
          }
        });

        if (!foundPrintSurface) {
          if (isMountedRef.current && !isDisposed) {
            setStatus({
              stage: "error",
              message: "Missing printable mesh (Front_Print_Surface) in 3D prototype.",
              progressPercent: 0,
              error: "Front_Print_Surface missing from model",
            });
          }
          return;
        }

        // Step 8: Preload customer photograph assets & synchronize canonical artwork
        setStatus({
          stage: "loading_artwork",
          message: "Synchronizing Canonical 2D Artwork to 3D Printable Surface...",
          progressPercent: 70,
        });

        try {
          await renderDoorTextureRef.current();
        } catch (artworkErr) {
          console.error("[3D Viewer] Canonical artwork synchronization failed:", artworkErr);
          if (isMountedRef.current && !isDisposed) {
            setStatus({
              stage: "error",
              message: "Failed to render customer artwork texture. Please ensure photo assets are accessible.",
              progressPercent: 0,
              error: String(artworkErr),
            });
          }
          return;
        }

        if (isDisposed || !isMountedRef.current) return;

        // Step 9: Render First Frame
        setStatus({
          stage: "rendering_frame",
          message: "Rendering Initial Viewport Frame...",
          progressPercent: 95,
        });

        renderer.render(scene, camera);

        // Step 10: Viewer Ready
        requestAnimationFrame(() => {
          if (isMountedRef.current && !isDisposed) {
            setStatus({
              stage: "ready",
              message: "Machine View Ready",
              progressPercent: 100,
            });
          }
        });
      },
      (progress) => {
        if (progress.total > 0 && isMountedRef.current) {
          const pct = Math.round((progress.loaded / progress.total) * 35) + 35;
          setStatus((prev) => ({
            ...prev,
            progressPercent: Math.min(prev.progressPercent, pct),
          }));
        }
      },
      (err) => {
        console.error("[3D Viewer] Error loading GLB prototype:", err);
        if (isMountedRef.current && !isDisposed) {
          setStatus({
            stage: "error",
            message: "Unable to load machine prototype geometry (/models/calvin-compact-01-prototype.glb).",
            progressPercent: 0,
            error: String(err),
          });
        }
      }
    );

    // 8. Continuous Render Loop with OrbitControls damping
    let isRunning = true;
    const animate = () => {
      if (!isRunning) return;
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. ResizeObserver on container
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 10. Clean-up
    return () => {
      isDisposed = true;
      isRunning = false;
      isMountedRef.current = false;

      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      printTexture.dispose();
      scene.clear();
    };
  }, [isOpen, retryTrigger]);

  // Update canvas texture if layers change while viewer is already open & ready
  useEffect(() => {
    if (status.stage === "ready") {
      renderDoorTexture();
    }
  }, [status.stage, renderDoorTexture]);

  // Handle Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!modalContainerRef.current) return;
    if (!document.fullscreenElement) {
      modalContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => { });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Camera Preset Helpers: Smooth framing changes without reloading model
  const setCameraPreset = (preset: "beauty" | "front" | "side") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    setActivePreset(preset);

    if (preset === "beauty") {
      // Three-Quarter Perspective: Isometric high angle
      camera.position.set(1.25, 0.65, 1.35);
      controls.target.copy(TARGET_CENTER);
    } else if (preset === "front") {
      // Front Elevation: Perfectly centered on door artwork & branding
      camera.position.set(0, 0.44, 1.3);
      controls.target.copy(TARGET_CENTER);
    } else if (preset === "side") {
      // Right Profile: Side chassis view
      camera.position.set(1.35, 0.44, 0);
      controls.target.copy(TARGET_CENTER);
    }

    camera.lookAt(TARGET_CENTER);
    controls.update();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalContainerRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="viewer-title"
    >
      <div className="relative flex flex-col w-full h-full max-w-6xl max-h-[92vh] rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl overflow-hidden">
        {/* Modal Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-stone-950 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Rotate3d className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="viewer-title" className="font-display text-sm font-bold text-white">
                  Interactive 3D Machine Viewer
                </h3>
                <span className="font-mono text-[10px] bg-stone-800 border border-stone-700 text-stone-300 rounded px-1.5 py-0.5">
                  {orderNumber}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {productName} • Model: <span className="font-mono text-stone-300">{modelCode}</span> ({surfaceDimensionsMm.width} × {surfaceDimensionsMm.height} mm Door Panel)
              </p>
            </div>
          </div>

          {/* Perspective Preset Tabs & Action Controls */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 bg-stone-900 border border-stone-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setCameraPreset("beauty")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${activePreset === "beauty"
                  ? "bg-amber-500 text-stone-950 font-bold shadow-xs"
                  : "text-stone-300 hover:text-white"
                  }`}
              >
                Three-Quarter
              </button>
              <button
                type="button"
                onClick={() => setCameraPreset("front")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${activePreset === "front"
                  ? "bg-amber-500 text-stone-950 font-bold shadow-xs"
                  : "text-stone-300 hover:text-white"
                  }`}
              >
                Front Elevation
              </button>
              <button
                type="button"
                onClick={() => setCameraPreset("side")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${activePreset === "side"
                  ? "bg-amber-500 text-stone-950 font-bold shadow-xs"
                  : "text-stone-300 hover:text-white"
                  }`}
              >
                Right Profile
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCameraPreset("beauty")}
              title="Reset Camera View"
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 transition"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden md:inline">{isFullscreen ? "Exit" : "Full Screen"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close Viewer"
              className="rounded-lg border border-stone-700 bg-stone-800 p-1.5 text-stone-300 hover:bg-red-900/50 hover:text-red-300 hover:border-red-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Prototype Warning Banner */}
        {mode === "demonstration" && (
          <div className="bg-amber-950/90 border-b border-amber-800/60 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-10 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong>Prototype Demonstration Order:</strong> 3D geometry and printable door coordinates (380 × 620 mm) reflect visual prototype specifications. Do not route to CNC/laser cutter without factory caliper validation.
              </span>
            </div>
            <span className="hidden md:inline-block font-mono text-[10px] bg-amber-900/80 border border-amber-700/60 rounded px-2 py-0.5 text-amber-300">
              IMMUTABLE SNAPSHOT
            </span>
          </div>
        )}

        {/* 3D Canvas Viewport */}
        <div
          ref={canvasContainerRef}
          className="relative flex-1 w-full h-full min-h-[380px] bg-[#F4F2EE] overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-grab active:cursor-grabbing outline-hidden"
          />

          {/* Staged Loading Indicator */}
          {status.stage !== "ready" && status.stage !== "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/75 backdrop-blur-sm text-stone-100 z-20 transition-opacity duration-300">
              <div className="relative mb-3">
                <LoaderCircle className="h-10 w-10 animate-spin text-amber-400" />
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-amber-300">
                  {status.progressPercent}%
                </div>
              </div>
              <p className="text-sm font-bold text-white tracking-wide">{status.message}</p>
              <p className="text-xs text-stone-400 mt-1 max-w-sm text-center">
                Applying customer photographs, typography &amp; prototype geometry
              </p>
              <div className="w-56 h-1.5 bg-stone-800 rounded-full mt-3 overflow-hidden border border-stone-700/50">
                <div
                  className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                  style={{ width: `${status.progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error / Retry State */}
          {status.stage === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/90 backdrop-blur-md text-stone-100 p-6 z-20 text-center">
              <AlertCircle className="h-11 w-11 text-red-400 mb-3" />
              <h4 className="text-base font-bold text-white">3D Viewport Loading Error</h4>
              <p className="text-xs text-stone-300 max-w-md mt-1">{status.message}</p>
              {status.error && (
                <p className="text-[11px] font-mono text-red-300/80 bg-red-950/40 border border-red-900/50 rounded-lg p-2 mt-2 max-w-lg">
                  {status.error}
                </p>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryTrigger((c) => c + 1)}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Loading Viewer</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Floating Orbit / Zoom Instructions Pill */}
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:right-auto flex items-center justify-between sm:justify-start gap-3 rounded-xl bg-stone-900/85 backdrop-blur-md border border-stone-700/60 px-3.5 py-1.5 text-[11px] text-stone-300 shadow-xl">
            <span>🖱️ <strong>Left Click + Drag:</strong> 360° Orbit</span>
            <span>•</span>
            <span>📜 <strong>Scroll:</strong> Zoom</span>
            <span>•</span>
            <span>🖱️ <strong>Right Click:</strong> Pan</span>
          </div>

          {/* Model Status Pill */}
          <div className="pointer-events-none absolute bottom-3 right-3 hidden sm:flex items-center gap-2 rounded-xl bg-black/80 backdrop-blur-md px-3 py-1 font-mono text-[10px] text-amber-400 border border-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>CALVIN-COMPACT-01 • 380×620mm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
