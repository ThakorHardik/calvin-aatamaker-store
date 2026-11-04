"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Crop,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lock,
  LockOpen,
  Move,
  Redo2,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  Loader2,
  ImageOff,
  RefreshCw,
} from "lucide-react";
import type {
  CanvasLayer,
  PhotoLayer,
  TextLayer,
  ProtectedBrandingConfig,
  SafeMarginMm,
} from "@/types/3d-model";
import {
  DesignHistoryManager,
  computeNormalizedBrandingBox,
  isPlacementSafeFromProtectedBranding,
} from "@/lib/3d/canonical-design";
import { resolveCustomizationAssetUrl, getOrCreateGuestToken } from "@/lib/3d/storage-assets";

interface EditorCanvasProps {
  surfaceWidthMm: number;
  surfaceHeightMm: number;
  safeMarginsMm: SafeMarginMm;
  branding: ProtectedBrandingConfig;
  initialLayers?: CanvasLayer[];
  onLayersChange: (layers: CanvasLayer[]) => void;
  onDesignValidChange?: (isValid: boolean) => void;
}

const CURATED_FONTS = [
  { name: "Cinzel (Classic)", value: "Cinzel, serif" },
  { name: "Playfair Display", value: "'Playfair Display', serif" },
  { name: "Inter (Modern Sans)", value: "Inter, sans-serif" },
  { name: "Montserrat", value: "Montserrat, sans-serif" },
  { name: "Noto Serif Devanagari", value: "'Noto Serif Devanagari', serif" },
];

const PRESET_COLORS = [
  "#1C1917", // Stone Charcoal
  "#B45309", // Amber Gold
  "#1E3A8A", // Royal Blue
  "#14532D", // Forest Green
  "#78350F", // Heritage Copper
  "#FFFFFF", // Crisp White
];

type TransformMode =
  | "move"
  | "resize-tl"
  | "resize-tr"
  | "resize-bl"
  | "resize-br"
  | "resize-t"
  | "resize-b"
  | "resize-l"
  | "resize-r"
  | "rotate"
  | null;

/**
 * Resilient Canvas Photo Element
 * Handles:
 * - Fresh authorized asset URL resolution (re-signing expired tokens)
 * - Complete image preloading & decode before render
 * - Loading placeholder indicator
 * - Non-destructive error state with retry action
 * - High-precision normalized crop rendering
 */
function CanvasPhotoElement({ layer }: { layer: PhotoLayer }) {
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [resolvedSrc, setResolvedSrc] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    setLoadState("loading");

    const rawTarget = layer.storagePath || layer.imageUrl;
    const freshUrl = resolveCustomizationAssetUrl(rawTarget) || layer.imageUrl;

    if (!freshUrl) {
      setLoadState("error");
      return;
    }

    const img = new Image();
    if (!freshUrl.startsWith("data:") && !freshUrl.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = async () => {
      if (isCancelled) return;
      try {
        await img.decode();
      } catch {}
      if (isCancelled) return;
      setResolvedSrc(freshUrl);
      setLoadState("loaded");
    };

    img.onerror = () => {
      if (isCancelled) return;
      if (
        layer.storagePath &&
        freshUrl !== `/api/customizations/upload?path=${encodeURIComponent(layer.storagePath)}`
      ) {
        const fallbackUrl = `/api/customizations/upload?path=${encodeURIComponent(layer.storagePath)}`;
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = "anonymous";
        fallbackImg.onload = () => {
          if (isCancelled) return;
          setResolvedSrc(fallbackUrl);
          setLoadState("loaded");
        };
        fallbackImg.onerror = () => {
          if (isCancelled) return;
          setLoadState("error");
        };
        fallbackImg.src = fallbackUrl;
      } else {
        setLoadState("error");
      }
    };

    img.src = freshUrl;

    return () => {
      isCancelled = true;
    };
  }, [layer.imageUrl, layer.storagePath, retryKey]);

  if (loadState === "loading") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-stone-900/60 backdrop-blur-xs border border-amber-500/30 rounded-xs text-amber-200 p-1 pointer-events-none">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        <span className="text-[9px] mt-0.5 font-medium tracking-wide">Loading...</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-stone-950/85 border border-red-500/40 rounded-xs p-1 text-center select-none pointer-events-auto">
        <ImageOff className="w-4 h-4 text-red-400 mb-0.5" />
        <span className="text-[9px] font-semibold text-red-200">Image unavailable</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRetryKey((k) => k + 1);
          }}
          className="mt-1 px-1.5 py-0.5 bg-red-950/80 hover:bg-red-900 border border-red-500/50 rounded text-[8px] font-bold text-red-100 flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-2 h-2" /> Retry
        </button>
      </div>
    );
  }

  const filterStyle =
    layer.filterPreset === "grayscale"
      ? "grayscale(100%)"
      : layer.filterPreset === "sepia"
      ? "sepia(80%)"
      : layer.filterPreset === "warm"
      ? "sepia(30%) saturate(130%)"
      : "none";

  if (layer.crop) {
    return (
      <div className="relative w-full h-full overflow-hidden pointer-events-none rounded-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedSrc}
          alt={layer.name}
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            width: `${100 / Math.max(0.01, layer.crop.width)}%`,
            height: `${100 / Math.max(0.01, layer.crop.height)}%`,
            left: `-${(layer.crop.x / Math.max(0.01, layer.crop.width)) * 100}%`,
            top: `-${(layer.crop.y / Math.max(0.01, layer.crop.height)) * 100}%`,
            objectFit: "fill",
            filter: filterStyle,
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden pointer-events-none rounded-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt={layer.name}
        crossOrigin="anonymous"
        className="w-full h-full object-contain pointer-events-none"
        style={{ filter: filterStyle }}
      />
    </div>
  );
}

export function EditorCanvas({
  surfaceWidthMm,
  surfaceHeightMm,
  safeMarginsMm,
  branding,
  initialLayers = [],
  onLayersChange,
  onDesignValidChange,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<CanvasLayer[]>(initialLayers);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [history] = useState(() => new DesignHistoryManager<CanvasLayer[]>(initialLayers));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Synchronize external initialLayers when loaded from draft/saved design
  const initialLayersRef = useRef<string>("");
  useEffect(() => {
    const serialized = JSON.stringify(initialLayers);
    if (serialized !== initialLayersRef.current && initialLayers.length > 0) {
      initialLayersRef.current = serialized;
      setLayers(initialLayers);
      history.reset(initialLayers);
    }
  }, [initialLayers, history]);

  // Dedicated Crop Mode State for Photo Layers
  const [isCropping, setIsCropping] = useState(false);
  const [cropDraft, setCropDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });

  // Interactive direct transformation drag state
  const dragRef = useRef<{
    mode: TransformMode;
    startX: number;
    startY: number;
    layerInitX: number;
    layerInitY: number;
    layerInitW: number;
    layerInitH: number;
    layerInitRot: number;
    aspectRatio: number;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  // Sync history state
  const updateLayers = useCallback(
    (newLayers: CanvasLayer[]) => {
      setLayers(newLayers);
      history.pushState(newLayers);
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      onLayersChange(newLayers);

      // Validate presence of at least one valid custom element
      const hasCustomerContent = newLayers.some(
        (l) => l.visible && l.type !== "locked_branding" && l.type !== "cutout_mask",
      );
      onDesignValidChange?.(hasCustomerContent);
    },
    [history, onLayersChange, onDesignValidChange],
  );

  const handleUndo = () => {
    const prevState = history.undo();
    if (prevState) {
      setLayers(prevState);
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      onLayersChange(prevState);
    }
  };

  const handleRedo = () => {
    const nextState = history.redo();
    if (nextState) {
      setLayers(nextState);
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      onLayersChange(nextState);
    }
  };

  // Add Photo Layer
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      const width = 0.5;
      const height = (width * (surfaceWidthMm / surfaceHeightMm)) / aspect;
      const layerId = `photo-${Date.now()}`;

      const newLayer: PhotoLayer = {
        id: layerId,
        type: "photo",
        name: file.name.slice(0, 20),
        originalFilename: file.name,
        mimeType: file.type || "image/jpeg",
        fileSizeBytes: file.size,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: layers.length + 1,
        x: 0.25,
        y: 0.35,
        width: Math.min(0.8, width),
        height: Math.min(0.6, height),
        rotationDeg: 0,
        imageUrl: localUrl,
        sourceWidthPx: img.width,
        sourceHeightPx: img.height,
      };

      const check = isPlacementSafeFromProtectedBranding(
        newLayer,
        branding,
        surfaceWidthMm,
        surfaceHeightMm,
      );
      if (!check.isSafe) {
        setConflictWarning(check.conflictReason || null);
      } else {
        setConflictWarning(null);
      }

      const next = [...layers, newLayer];
      updateLayers(next);
      setSelectedLayerId(newLayer.id);

      // Async storage upload via API with persistent guest session token
      const guestToken = getOrCreateGuestToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "photo");
      if (guestToken) {
        formData.append("guestToken", guestToken);
      }
      fetch("/api/customizations/upload", {
        method: "POST",
        body: formData,
        headers: guestToken ? { "x-guest-token": guestToken } : undefined,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.storagePath) {
            updateLayers(
              next.map((l) =>
                l.id === layerId
                  ? ({
                      ...l,
                      imageUrl: json.url || (l as PhotoLayer).imageUrl,
                      storagePath: json.storagePath,
                      originalFilename: file.name,
                      mimeType: file.type || json.contentType || "image/jpeg",
                      fileSizeBytes: file.size || json.sizeBytes,
                      assetId: json.storagePath || l.id,
                    } as PhotoLayer)
                  : l,
              ),
            );
          }
        })
        .catch((err) => {
          console.warn("Async storage upload failed (local fallback preserved):", err);
        });
    };
    img.src = localUrl;
    e.target.value = "";
  };

  // Add Text Layer
  const handleAddText = () => {
    const newLayer: TextLayer = {
      id: `text-${Date.now()}`,
      type: "text",
      name: "Custom Inscription",
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: layers.length + 1,
      x: 0.2,
      y: 0.6,
      width: 0.6,
      height: 0.08,
      rotationDeg: 0,
      text: "Shree Ganesh Kripa",
      fontFamily: CURATED_FONTS[0].value,
      fontSizePt: 28,
      fillColorHex: "#B45309",
      textAlign: "center",
      fontWeight: "bold",
    };

    const next = [...layers, newLayer];
    updateLayers(next);
    setSelectedLayerId(newLayer.id);
  };

  // Update Active Layer
  const updateSelectedLayer = useCallback(
    (partial: Partial<CanvasLayer>) => {
      if (!selectedLayerId) return;

      const next = layers.map((l) => {
        if (l.id !== selectedLayerId) return l;
        const updated = { ...l, ...partial } as CanvasLayer;

        const check = isPlacementSafeFromProtectedBranding(
          updated,
          branding,
          surfaceWidthMm,
          surfaceHeightMm,
        );
        if (!check.isSafe) {
          setConflictWarning(check.conflictReason || null);
        } else {
          setConflictWarning(null);
        }

        return updated;
      });

      updateLayers(next);
    },
    [layers, selectedLayerId, branding, surfaceWidthMm, surfaceHeightMm, updateLayers],
  );

  // Delete Layer
  const deleteSelectedLayer = () => {
    if (!selectedLayerId) return;
    const next = layers.filter((l) => l.id !== selectedLayerId);
    setSelectedLayerId(null);
    setConflictWarning(null);
    setIsCropping(false);
    updateLayers(next);
  };

  // Toggle Layer Visibility
  const toggleLayerVisibility = (layerId: string) => {
    const next = layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l));
    updateLayers(next);
  };

  // Layer Reordering
  const moveLayer = (direction: "up" | "down") => {
    if (!selectedLayerId) return;
    const index = layers.findIndex((l) => l.id === selectedLayerId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index + 1 : index - 1;
    if (newIndex < 0 || newIndex >= layers.length) return;

    const reordered = [...layers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const updated = reordered.map((l, i) => ({ ...l, zIndex: i + 1 }));
    updateLayers(updated);
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  // Compute Protected Branding Box in Normalized Viewport (120mm x 52.3mm at y=35mm)
  const brandingBox = computeNormalizedBrandingBox(
    branding,
    surfaceWidthMm,
    surfaceHeightMm,
  );

  // ---------------------------------------------------------------------------
  // Keyboard Arrow Keys (Nudge) Support with Form Focus Guard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedLayerId) return;

      // Ignore when focused inside an input, textarea or contenteditable element
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const layer = layers.find((l) => l.id === selectedLayerId);
      if (!layer) return;

      const step = e.shiftKey ? 0.02 : 0.005; // 10px vs 1-2px normalized step

      let dx = 0;
      let dy = 0;

      if (e.key === "ArrowLeft") {
        dx = -step;
      } else if (e.key === "ArrowRight") {
        dx = step;
      } else if (e.key === "ArrowUp") {
        dy = -step;
      } else if (e.key === "ArrowDown") {
        dy = step;
      } else {
        return;
      }

      e.preventDefault();

      const newX = Math.max(0, Math.min(1 - layer.width, layer.x + dx));
      const newY = Math.max(0, Math.min(1 - layer.height, layer.y + dy));

      updateSelectedLayer({ x: newX, y: newY });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLayerId, layers, updateSelectedLayer]);

  // ---------------------------------------------------------------------------
  // Direct Pointer Drag / Resize / Rotate Event Listeners
  // ---------------------------------------------------------------------------
  const handlePointerDownTransform = (mode: TransformMode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!selectedLayer || !containerRef.current) return;

    const boardRect = containerRef.current.getBoundingClientRect();
    const layerScreenCenterX = boardRect.left + (selectedLayer.x + selectedLayer.width / 2) * boardRect.width;
    const layerScreenCenterY = boardRect.top + (selectedLayer.y + selectedLayer.height / 2) * boardRect.height;
    const aspectRatio = selectedLayer.width / (selectedLayer.height || 1);

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      layerInitX: selectedLayer.x,
      layerInitY: selectedLayer.y,
      layerInitW: selectedLayer.width,
      layerInitH: selectedLayer.height,
      layerInitRot: selectedLayer.rotationDeg,
      aspectRatio,
      centerScreenX: layerScreenCenterX,
      centerScreenY: layerScreenCenterY,
    };

    const handlePointerMove = (moveEv: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !containerRef.current || !selectedLayerId) return;

      const rect = containerRef.current.getBoundingClientRect();
      const normDeltaX = (moveEv.clientX - drag.startX) / rect.width;
      const normDeltaY = (moveEv.clientY - drag.startY) / rect.height;

      let nextX = drag.layerInitX;
      let nextY = drag.layerInitY;
      let nextW = drag.layerInitW;
      let nextH = drag.layerInitH;
      let nextRot = drag.layerInitRot;

      if (drag.mode === "move") {
        nextX = Math.max(0, Math.min(1 - nextW, drag.layerInitX + normDeltaX));
        nextY = Math.max(0, Math.min(1 - nextH, drag.layerInitY + normDeltaY));
      } else if (drag.mode === "resize-br") {
        nextW = Math.max(0.1, Math.min(1 - nextX, drag.layerInitW + normDeltaX));
        if (aspectLocked) {
          nextH = nextW / drag.aspectRatio;
        } else {
          nextH = Math.max(0.04, Math.min(1 - nextY, drag.layerInitH + normDeltaY));
        }
      } else if (drag.mode === "resize-bl") {
        const potentialW = drag.layerInitW - normDeltaX;
        if (potentialW >= 0.1 && drag.layerInitX + normDeltaX >= 0) {
          nextX = drag.layerInitX + normDeltaX;
          nextW = potentialW;
        }
        if (aspectLocked) {
          nextH = nextW / drag.aspectRatio;
        } else {
          nextH = Math.max(0.04, Math.min(1 - nextY, drag.layerInitH + normDeltaY));
        }
      } else if (drag.mode === "resize-tr") {
        nextW = Math.max(0.1, Math.min(1 - nextX, drag.layerInitW + normDeltaX));
        if (aspectLocked) {
          nextH = nextW / drag.aspectRatio;
          nextY = drag.layerInitY + (drag.layerInitH - nextH);
        } else {
          const potentialH = drag.layerInitH - normDeltaY;
          if (potentialH >= 0.04 && drag.layerInitY + normDeltaY >= 0) {
            nextY = drag.layerInitY + normDeltaY;
            nextH = potentialH;
          }
        }
      } else if (drag.mode === "resize-tl") {
        const potentialW = drag.layerInitW - normDeltaX;
        if (potentialW >= 0.1 && drag.layerInitX + normDeltaX >= 0) {
          nextX = drag.layerInitX + normDeltaX;
          nextW = potentialW;
        }
        if (aspectLocked) {
          nextH = nextW / drag.aspectRatio;
          nextY = drag.layerInitY + (drag.layerInitH - nextH);
        } else {
          const potentialH = drag.layerInitH - normDeltaY;
          if (potentialH >= 0.04 && drag.layerInitY + normDeltaY >= 0) {
            nextY = drag.layerInitY + normDeltaY;
            nextH = potentialH;
          }
        }
      } else if (drag.mode === "resize-r") {
        nextW = Math.max(0.1, Math.min(1 - nextX, drag.layerInitW + normDeltaX));
      } else if (drag.mode === "resize-l") {
        const potentialW = drag.layerInitW - normDeltaX;
        if (potentialW >= 0.1 && drag.layerInitX + normDeltaX >= 0) {
          nextX = drag.layerInitX + normDeltaX;
          nextW = potentialW;
        }
      } else if (drag.mode === "resize-b") {
        nextH = Math.max(0.04, Math.min(1 - nextY, drag.layerInitH + normDeltaY));
      } else if (drag.mode === "resize-t") {
        const potentialH = drag.layerInitH - normDeltaY;
        if (potentialH >= 0.04 && drag.layerInitY + normDeltaY >= 0) {
          nextY = drag.layerInitY + normDeltaY;
          nextH = potentialH;
        }
      } else if (drag.mode === "rotate") {
        const angleRad = Math.atan2(
          moveEv.clientY - drag.centerScreenY,
          moveEv.clientX - drag.centerScreenX,
        );
        const angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
        nextRot = angleDeg;
      }

      setLayers((prev) =>
        prev.map((l) =>
          l.id === selectedLayerId
            ? ({
                ...l,
                x: nextX,
                y: nextY,
                width: nextW,
                height: nextH,
                rotationDeg: nextRot,
              } as CanvasLayer)
            : l,
        ),
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      dragRef.current = null;

      // Commit transformed state to undo/redo history
      setLayers((current) => {
        history.pushState(current);
        setCanUndo(history.canUndo());
        setCanRedo(history.canRedo());
        onLayersChange(current);

        const active = current.find((l) => l.id === selectedLayerId);
        if (active) {
          const check = isPlacementSafeFromProtectedBranding(
            active,
            branding,
            surfaceWidthMm,
            surfaceHeightMm,
          );
          setConflictWarning(check.isSafe ? null : check.conflictReason || null);
        }

        return current;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // ---------------------------------------------------------------------------
  // Photo Crop Tool Actions
  // ---------------------------------------------------------------------------
  const handleStartCrop = () => {
    if (!selectedLayer || selectedLayer.type !== "photo") return;
    const photo = selectedLayer as PhotoLayer;
    setCropDraft(
      photo.crop || {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    );
    setIsCropping(true);
  };

  const handleApplyCrop = () => {
    if (!selectedLayer || selectedLayer.type !== "photo") return;
    updateSelectedLayer({ crop: cropDraft });
    setIsCropping(false);
  };

  const handleResetCrop = () => {
    if (!selectedLayer || selectedLayer.type !== "photo") return;
    updateSelectedLayer({ crop: undefined });
    setIsCropping(false);
  };

  // Nudge Helpers for On-Screen D-Pad
  const handleNudge = (dx: number, dy: number) => {
    if (!selectedLayer) return;
    const nextX = Math.max(0, Math.min(1 - selectedLayer.width, selectedLayer.x + dx));
    const nextY = Math.max(0, Math.min(1 - selectedLayer.height, selectedLayer.y + dy));
    updateSelectedLayer({ x: nextX, y: nextY });
  };

  const handleCenterHorizontal = () => {
    if (!selectedLayer) return;
    const nextX = Math.max(0, (1 - selectedLayer.width) / 2);
    updateSelectedLayer({ x: nextX });
  };

  const handleCenterVertical = () => {
    if (!selectedLayer) return;
    const nextY = Math.max(0, (1 - selectedLayer.height) / 2);
    updateSelectedLayer({ y: nextY });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* 2D Canvas Viewport Column */}
      <div className="flex-1 w-full flex flex-col items-center">
        {/* Undo / Redo & Toolbar */}
        <div className="w-full max-w-md mb-3 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-undo"
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-2 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition shadow-2xs"
              title="Undo"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              data-testid="btn-redo"
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-2 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition shadow-2xs"
              title="Redo"
            >
              <Redo2 size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 transition">
              <Upload size={14} className="text-amber-600" />
              Upload Photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </label>

            <button
              onClick={handleAddText}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-stone-800 transition"
            >
              <Type size={14} />
              Add Text
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        {conflictWarning && (
          <div className="w-full max-w-md mb-3 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-center gap-2 shadow-2xs">
            <Lock size={14} className="shrink-0 text-amber-700" />
            <span className="font-medium">{conflictWarning}</span>
          </div>
        )}

        {/* Workspace Canvas Container (Warm light neutral surround with clear boundaries) */}
        <div className="w-full max-w-md rounded-2xl border border-stone-300/80 bg-[#F5F3EF] p-4 sm:p-6 shadow-xl flex items-center justify-center">
          {/* The 2D Interactive Board (Actual Front Door Panel Surface) */}
          <div
            ref={containerRef}
            data-testid="editor-canvas-board"
            data-board-container="true"
            className="relative rounded-xl border-2 border-stone-800 bg-[#18181C] shadow-2xl overflow-hidden select-none"
            style={{
              width: "320px",
              height: `${Math.round((surfaceHeightMm / (surfaceWidthMm || 1)) * 320)}px`,
              maxHeight: "560px",
            }}
            onClick={(e) => {
              // Clear selection only when clicking empty board space
              if (
                e.target === e.currentTarget ||
                (e.target as HTMLElement).getAttribute("data-board-bg") === "true"
              ) {
                if (!isCropping) {
                  setSelectedLayerId(null);
                }
              }
            }}
          >
            {/* Subtle Matte Powder-Coat Texture Background */}
            <div
              data-board-bg="true"
              className="absolute inset-0 bg-gradient-to-b from-[#202026] via-[#18181C] to-[#131317]"
            />

            {/* Safe Margins Guide Border */}
            <div
              data-testid="safe-margin-guide"
              data-board-bg="true"
              className="absolute border border-dashed border-stone-600/70 pointer-events-none rounded"
              style={{
                top: `${(safeMarginsMm.top / surfaceHeightMm) * 100}%`,
                bottom: `${(safeMarginsMm.bottom / surfaceHeightMm) * 100}%`,
                left: `${(safeMarginsMm.left / surfaceWidthMm) * 100}%`,
                right: `${(safeMarginsMm.right / surfaceWidthMm) * 100}%`,
              }}
            >
              <span className="absolute bottom-1 right-1 text-[8px] font-mono text-stone-500">
                Safe Printable Zone
              </span>
            </div>

            {/* Protected Branding Exclusion Zone Guide */}
            {branding.enabled && (
              <div
                data-testid="protected-branding-zone"
                className="absolute border border-dashed border-red-500/40 pointer-events-none rounded"
                style={{
                  left: `${brandingBox.x * 100}%`,
                  top: `${brandingBox.y * 100}%`,
                  width: `${brandingBox.width * 100}%`,
                  height: `${brandingBox.height * 100}%`,
                }}
              />
            )}

            {/* TASK 4: Official Transparent CALVIN Logo Asset — OFFICIAL CALVIN BRANDING (LOCKED & UNTOUCHABLE) */}
            {branding.enabled && (
              <div
                className="absolute z-30 flex items-center justify-center pointer-events-none select-none"
                style={{
                  left: `${brandingBox.x * 100}%`,
                  top: `${brandingBox.y * 100}%`,
                  width: `${brandingBox.width * 100}%`,
                  height: `${brandingBox.height * 100}%`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="official-calvin-logo"
                  src="/images/calvin-aatamaker-logo.png"
                  alt="CALVIN"
                  className="w-full h-full object-contain filter drop-shadow-sm pointer-events-none"
                />
              </div>
            )}

            {/* Active Canvas Layers */}
            {layers.map((layer) => {
              if (!layer.visible) return null;
              const isSelected = layer.id === selectedLayerId;

              return (
                <div
                  key={layer.id}
                  data-layer-id={layer.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLayerId(layer.id);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedLayerId(layer.id);
                    handlePointerDownTransform("move", e);
                  }}
                  className={`absolute group cursor-move select-none transition-shadow ${
                    isSelected ? "z-40" : "hover:ring-1 hover:ring-amber-500/50"
                  }`}
                  style={{
                    left: `${layer.x * 100}%`,
                    top: `${layer.y * 100}%`,
                    width: `${layer.width * 100}%`,
                    height: `${layer.height * 100}%`,
                    transform: `rotate(${layer.rotationDeg}deg)`,
                    zIndex: layer.zIndex,
                    opacity: layer.opacity,
                  }}
                >
                  {/* Photo Layer with Resilient Loading, Decoding, Error Recovery & Cropping */}
                  {layer.type === "photo" && (
                    <CanvasPhotoElement layer={layer as PhotoLayer} />
                  )}

                  {/* Text Layer */}
                  {layer.type === "text" && (
                    <div
                      className="w-full h-full flex items-center justify-center font-bold px-1 overflow-hidden pointer-events-none"
                      style={{
                        fontFamily: layer.fontFamily,
                        color: layer.fillColorHex,
                        textAlign: layer.textAlign,
                        fontSize: `${Math.max(12, Math.round(layer.fontSizePt * 0.65))}px`,
                      }}
                    >
                      {layer.text}
                    </div>
                  )}

                  {/* Canva-Style Selection Bounding Box & 8 Resize Handles + Rotation Handle */}
                  {isSelected && !isCropping && (
                    <div className="absolute inset-0 border-2 border-amber-500 pointer-events-none">
                      {/* Rotation Handle & Connecting Stem */}
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
                        <div
                          onPointerDown={(e) => handlePointerDownTransform("rotate", e)}
                          className="w-5 h-5 rounded-full bg-white border-2 border-amber-600 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center hover:scale-125 transition-transform"
                          title="Rotate Element"
                        >
                          <RotateCw size={10} className="text-amber-700" />
                        </div>
                        <div className="w-0.5 h-2 bg-amber-500" />
                      </div>

                      {/* 4 Corner Resize Handles */}
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-tl", e)}
                        className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-600 rounded-xs shadow-xs cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-tr", e)}
                        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-600 rounded-xs shadow-xs cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-bl", e)}
                        className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-600 rounded-xs shadow-xs cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-br", e)}
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-600 rounded-xs shadow-xs cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
                      />

                      {/* 4 Edge Resize Handles */}
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-t", e)}
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-amber-600 rounded-xs shadow-xs cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-b", e)}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-amber-600 rounded-xs shadow-xs cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-l", e)}
                        className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-4 bg-white border border-amber-600 rounded-xs shadow-xs cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDownTransform("resize-r", e)}
                        className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-4 bg-white border border-amber-600 rounded-xs shadow-xs cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Interactive Photo Crop Overlay Modal */}
            {isCropping && selectedLayer && selectedLayer.type === "photo" && (
              <div data-testid="crop-overlay" className="absolute inset-0 bg-black/90 backdrop-blur-xs z-50 flex flex-col p-3">
                <div className="flex items-center justify-between text-white text-xs mb-2">
                  <span className="font-bold flex items-center gap-1.5 text-amber-400">
                    <Crop size={14} /> Crop & Framing
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="btn-reset-crop"
                      onClick={handleResetCrop}
                      className="px-2 py-0.5 rounded text-[10px] text-stone-300 hover:text-white border border-stone-700 transition"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCropping(false)}
                      className="p-1 rounded text-stone-400 hover:text-white transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Crop Visual Adjustment Box */}
                <div className="relative flex-1 flex items-center justify-center overflow-hidden border border-stone-800 rounded-lg bg-stone-950 p-2">
                  <div className="relative max-w-full max-h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        resolveCustomizationAssetUrl(
                          (selectedLayer as PhotoLayer).storagePath || selectedLayer.imageUrl
                        ) || selectedLayer.imageUrl
                      }
                      alt="Crop preview"
                      crossOrigin="anonymous"
                      className="max-h-[220px] w-auto object-contain select-none"
                    />
                    {/* Highlighted Crop Area Box */}
                    <div
                      className="absolute border-2 border-amber-400 bg-amber-400/25 shadow-lg"
                      style={{
                        left: `${cropDraft.x * 100}%`,
                        top: `${cropDraft.y * 100}%`,
                        width: `${cropDraft.width * 100}%`,
                        height: `${cropDraft.height * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Crop Dimension Sliders */}
                <div className="mt-2 space-y-2 text-[10px] text-stone-300">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <ZoomIn size={11} className="text-amber-400" />
                      Horizontal Width:
                    </span>
                    <span className="font-mono text-amber-300">{Math.round(cropDraft.width * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={cropDraft.width}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      setCropDraft((prev) => ({
                        ...prev,
                        width: w,
                        x: Math.min(prev.x, 1 - w),
                      }));
                    }}
                    className="w-full accent-amber-500 h-1"
                  />

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <ZoomIn size={11} className="text-amber-400" />
                      Vertical Height:
                    </span>
                    <span className="font-mono text-amber-300">{Math.round(cropDraft.height * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={cropDraft.height}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      setCropDraft((prev) => ({
                        ...prev,
                        height: h,
                        y: Math.min(prev.y, 1 - h),
                      }));
                    }}
                    className="w-full accent-amber-500 h-1"
                  />
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCropping(false)}
                    className="px-3 py-1 rounded-lg bg-stone-800 text-stone-200 text-xs font-semibold hover:bg-stone-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="btn-apply-crop"
                    onClick={handleApplyCrop}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 transition shadow-xs"
                  >
                    <Check size={13} />
                    Apply Crop
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-stone-500">
          Click an element or select from the layer list to edit. Drag corners to scale, or use arrow keys to nudge.
        </p>
      </div>

      {/* Property Inspector & Layer Manager Column */}
      <div className="w-full lg:w-80 space-y-4">
        {/* TASK 1: Design Layers List (Always Synchronized) */}
        <div data-testid="design-layers-list" className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Layers size={13} className="text-amber-600" />
              Design Layers ({layers.length})
            </span>
            <span className="text-[10px] text-stone-400 font-mono">Front Panel</span>
          </div>

          <div className="space-y-1.5">
            {/* Fixed Protected Brand Layer (Non-editable) */}
            {branding.enabled && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200 text-xs select-none">
                <div className="flex items-center gap-2">
                  <Lock size={12} className="text-amber-600 shrink-0" />
                  <span className="font-semibold text-stone-800">Official CALVIN Logo (Locked)</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Fixed
                </span>
              </div>
            )}

            {/* Customer Layers */}
            {layers.length === 0 ? (
              <p className="text-[11px] text-stone-400 italic py-2 text-center">
                No custom layers added yet. Upload a photo or add text above.
              </p>
            ) : (
              layers.map((layer) => {
                const isSelected = layer.id === selectedLayerId;
                return (
                  <div
                    key={layer.id}
                    data-testid={`layer-item-${layer.id}`}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                      isSelected
                        ? "bg-amber-50/90 border-amber-400 ring-1 ring-amber-400 text-amber-950 font-bold shadow-2xs"
                        : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <div
                      data-testid={`layer-select-${layer.id}`}
                      className="flex items-center gap-2 min-w-0"
                    >
                      {layer.type === "photo" ? (
                        <ImageIcon size={13} className="text-amber-600 shrink-0" />
                      ) : (
                        <Type size={13} className="text-stone-700 shrink-0" />
                      )}
                      <span className="truncate">
                        {layer.type === "text"
                          ? `"${(layer as TextLayer).text || "Text"}"`
                          : layer.name || "Customer Photo"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`layer-visibility-${layer.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerVisibility(layer.id);
                        }}
                        className="p-1 text-stone-400 hover:text-stone-700 rounded transition"
                        title={layer.visible ? "Hide layer" : "Show layer"}
                      >
                        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        type="button"
                        data-testid={`layer-delete-${layer.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLayerId(layer.id);
                          deleteSelectedLayer();
                        }}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded transition"
                        title="Delete layer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Layer Properties Inspector */}
        {selectedLayer ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs space-y-4 animate-in fade-in-50">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                {selectedLayer.type === "photo" ? <ImageIcon size={13} /> : <Type size={13} />}
                {selectedLayer.type === "photo" ? "Photo Properties" : "Text Properties"}
              </span>
              <button
                type="button"
                onClick={deleteSelectedLayer}
                className="text-stone-400 hover:text-rose-600 transition"
                title="Delete Layer"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Photo Crop Action */}
            {selectedLayer.type === "photo" && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                <div className="text-xs">
                  <span className="font-semibold text-stone-800 block">Photo Cropping</span>
                  <span className="text-[10px] text-stone-500">
                    {selectedLayer.crop ? "Custom crop applied" : "Full original photo"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedLayer.crop && (
                    <button
                      type="button"
                      data-testid="btn-reset-crop"
                      onClick={handleResetCrop}
                      className="px-2 py-1 text-[11px] text-stone-600 hover:text-stone-900 border border-stone-200 rounded-md bg-white transition"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="btn-open-crop"
                    onClick={handleStartCrop}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700 shadow-2xs transition"
                  >
                    <Crop size={12} />
                    {selectedLayer.crop ? "Edit Crop" : "Crop"}
                  </button>
                </div>
              </div>
            )}

            {/* Size & Aspect Ratio Controls */}
            <div className="space-y-2 pt-1 border-t border-stone-100">
              <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
                <span>Dimensions & Proportions</span>
                <button
                  type="button"
                  data-testid="toggle-aspect-ratio"
                  onClick={() => setAspectLocked(!aspectLocked)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                    aspectLocked
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : "bg-stone-50 text-stone-600 border-stone-200"
                  }`}
                  title={aspectLocked ? "Aspect Ratio Locked" : "Aspect Ratio Unlocked"}
                >
                  {aspectLocked ? <Lock size={10} /> : <LockOpen size={10} />}
                  <span>{aspectLocked ? "Locked Aspect" : "Free Scaling"}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-stone-500 block mb-0.5">Width (%)</label>
                  <input
                    type="number"
                    data-testid="input-layer-width"
                    min={10}
                    max={90}
                    value={Math.round(selectedLayer.width * 100)}
                    onChange={(e) => {
                      const newW = Number(e.target.value) / 100;
                      if (aspectLocked) {
                        const ratio = selectedLayer.height / selectedLayer.width;
                        updateSelectedLayer({ width: newW, height: newW * ratio });
                      } else {
                        updateSelectedLayer({ width: newW });
                      }
                    }}
                    className="w-full rounded-md border border-stone-200 px-2 py-1 text-xs font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500 block mb-0.5">Height (%)</label>
                  <input
                    type="number"
                    data-testid="input-layer-height"
                    min={4}
                    max={90}
                    value={Math.round(selectedLayer.height * 100)}
                    onChange={(e) => {
                      const newH = Number(e.target.value) / 100;
                      if (aspectLocked) {
                        const ratio = selectedLayer.width / selectedLayer.height;
                        updateSelectedLayer({ height: newH, width: newH * ratio });
                      } else {
                        updateSelectedLayer({ height: newH });
                      }
                    }}
                    className="w-full rounded-md border border-stone-200 px-2 py-1 text-xs font-mono font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Rotation Controls */}
            <div className="space-y-1.5 pt-2 border-t border-stone-100">
              <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
                <span>Rotation Angle</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-stone-800">{selectedLayer.rotationDeg}°</span>
                  {selectedLayer.rotationDeg !== 0 && (
                    <button
                      type="button"
                      data-testid="btn-reset-rotation"
                      onClick={() => updateSelectedLayer({ rotationDeg: 0 })}
                      className="p-0.5 text-stone-400 hover:text-amber-700 rounded transition"
                      title="Reset Rotation to 0°"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                data-testid="slider-layer-rotation"
                min={-180}
                max={180}
                step={5}
                value={selectedLayer.rotationDeg}
                onChange={(e) => updateSelectedLayer({ rotationDeg: Number(e.target.value) })}
                className="w-full accent-amber-600"
              />
            </div>

            {/* Position & Directional D-Pad */}
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
                <span>Position & Alignment</span>
                <span className="font-mono text-stone-400 text-[10px]">
                  X: {Math.round(selectedLayer.x * 100)}% Y: {Math.round(selectedLayer.y * 100)}%
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                {/* D-Pad Buttons */}
                <div className="grid grid-cols-3 gap-1 w-24">
                  <div />
                  <button
                    type="button"
                    data-testid="dpad-up"
                    onClick={() => handleNudge(0, -0.01)}
                    className="p-1 rounded bg-stone-100 hover:bg-amber-100 border border-stone-200 text-stone-700 flex items-center justify-center transition"
                    title="Nudge Up"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <div />
                  <button
                    type="button"
                    data-testid="dpad-left"
                    onClick={() => handleNudge(-0.01, 0)}
                    className="p-1 rounded bg-stone-100 hover:bg-amber-100 border border-stone-200 text-stone-700 flex items-center justify-center transition"
                    title="Nudge Left"
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <div className="flex items-center justify-center">
                    <Move size={10} className="text-stone-400" />
                  </div>
                  <button
                    type="button"
                    data-testid="dpad-right"
                    onClick={() => handleNudge(0.01, 0)}
                    className="p-1 rounded bg-stone-100 hover:bg-amber-100 border border-stone-200 text-stone-700 flex items-center justify-center transition"
                    title="Nudge Right"
                  >
                    <ArrowRight size={12} />
                  </button>
                  <div />
                  <button
                    type="button"
                    data-testid="dpad-down"
                    onClick={() => handleNudge(0, 0.01)}
                    className="p-1 rounded bg-stone-100 hover:bg-amber-100 border border-stone-200 text-stone-700 flex items-center justify-center transition"
                    title="Nudge Down"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <div />
                </div>

                {/* Alignment Helpers */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <button
                    type="button"
                    data-testid="btn-center-horizontal"
                    onClick={handleCenterHorizontal}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition"
                  >
                    <AlignCenter size={12} />
                    Center Horizontally
                  </button>
                  <button
                    type="button"
                    data-testid="btn-center-vertical"
                    onClick={handleCenterVertical}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition"
                  >
                    <AlignCenter size={12} className="rotate-90" />
                    Center Vertically
                  </button>
                </div>
              </div>
            </div>

            {/* Typography Controls for Text Layer */}
            {selectedLayer.type === "text" && (
              <div className="border-t border-stone-100 pt-3 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Inscription Content
                  </label>
                  <input
                    type="text"
                    data-testid="input-text-inscription"
                    value={selectedLayer.text}
                    onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold focus:border-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Font Family
                  </label>
                  <select
                    value={selectedLayer.fontFamily}
                    onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-hidden"
                  >
                    {CURATED_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Color Palette
                  </label>
                  <div className="flex items-center gap-2">
                    {PRESET_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => updateSelectedLayer({ fillColorHex: col })}
                        className={`w-6 h-6 rounded-full border border-stone-300 shadow-2xs ${
                          selectedLayer.fillColorHex === col ? "ring-2 ring-amber-600 ring-offset-1" : ""
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Layer Order Controls */}
            <div className="border-t border-stone-100 pt-3 flex items-center justify-between text-xs">
              <span className="text-stone-500">Layer Stacking Order</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveLayer("down")}
                  className="p-1 rounded border border-stone-200 hover:bg-stone-50 transition"
                  title="Move Down"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveLayer("up")}
                  className="p-1 rounded border border-stone-200 hover:bg-stone-50 transition"
                  title="Move Up"
                >
                  <ArrowUp size={13} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-5 text-center text-xs text-stone-500">
            <Sparkles size={24} className="mx-auto text-stone-300 mb-2" />
            <p className="font-semibold text-stone-700">No Layer Selected</p>
            <p className="mt-1">
              Select any photo or text element on the machine front panel or from the layers list above to adjust position, size, and styling.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
