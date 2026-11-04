"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Info,
  LoaderCircle,
  Package,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wheat,
  Camera,
  Palette,
  Rotate3d,
  Zap,
  Save,
  BookmarkCheck,
} from "lucide-react";

import { EditorCanvas } from "@/components/customizer/2d-editor-canvas";
import { ViewportPreview, type ViewportPreviewHandle } from "@/components/customizer/3d-viewport-preview";
import type {
  CanvasLayer,
  TextLayer,
  Product3DModel,
  ProductPrintableSurface,
} from "@/types/3d-model";

import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { supabase } from "@/lib/supabase/client";
import {
  computeDesignFingerprint,
  generateCartItemId,
  readSavedCart,
  saveCart,
  formatCustomisationSummary,
} from "@/lib/cart";
import type { CartItem } from "@/types/cart";
import { initialProducts } from "@/lib/mock-data";
import {
  type ProductCustomizationConfig,
  computeCustomizationPriceDelta,
  validateCustomizationSubmission,
} from "@/types/customization";
import { buildImmutableCustomizationSnapshot } from "@/lib/3d/order-snapshot";
import { renderCanonicalFlatArtworkDataUrl } from "@/lib/3d/canonical-artwork";
import { extractStoragePath, resolveCustomizationAssetUrl } from "@/lib/3d/storage-assets";
import type { PhotoLayer } from "@/types/3d-model";

type ProductImage = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
  options: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  dimensions_cm: Record<string, string | number | null> | null;
  weight_kg: number | null;
  is_customisable: boolean;
  is_featured: boolean;
  customization_config: ProductCustomizationConfig | null;
  categories: { name: string } | null;
  product_images: ProductImage[];
  product_variants: ProductVariant[];
};

const DEFAULT_FALLBACK_CONFIG: ProductCustomizationConfig = {
  enabled: true,
  mode: "demonstration",
  allow_photo_upload: true,
  allow_text_tools: true,
  max_photo_size_mb: 10,
  max_text_layers: 5,
  fields: [
    {
      id: "front_panel_finish",
      type: "swatch",
      label: "Cabinet Door & Panel Finish",
      help_text: "Select handcrafted timber veneer or architectural matte finish.",
      required: true,
      options: [
        { id: "opt_matte_black", value: "matte_black", label: "Midnight Matte Charcoal", price_delta: 0, swatch_color: "#18181C" },
        { id: "opt_teak_grain", value: "teak_grain", label: "Natural Warm Teak", price_delta: 1500, swatch_color: "#8B4513" },
        { id: "opt_royal_walnut", value: "royal_walnut", label: "Royal Dark Walnut", price_delta: 2200, swatch_color: "#4A2E18" },
        { id: "opt_brushed_brass", value: "brushed_brass", label: "Champagne Brushed Metallic", price_delta: 3500, swatch_color: "#D4AF37" },
      ],
    },
    {
      id: "sieve_mesh_grade",
      type: "select",
      label: "Specialized Flour Mesh Kit",
      help_text: "Included stone-grinding sieve assortment for different grains.",
      required: true,
      options: [
        { id: "opt_std_sieve", value: "standard_assortment", label: "Complete 7-Sieve Domestic Kit (Standard)", price_delta: 0 },
        { id: "opt_micro_sieve", value: "micro_flour_sieve", label: "Ultra-Fine Bakery & Gluten-Free Sieve Kit", price_delta: 750 },
        { id: "opt_heavy_millets", value: "millets_multi_grain", label: "Coarse Millets & Multi-Grain Grinding Kit", price_delta: 850 },
      ],
    },
    {
      id: "family_name_engraving",
      type: "text",
      label: "Bespoke Brass Door Inscription",
      help_text: "Custom family name or kitchen inscription (up to 30 characters).",
      required: false,
      max_length: 30,
    },
  ],
};

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function storageImageUrl(path: string | null | undefined): string {
  if (!path) return "/images/calvin-aatamaker-logo.png";
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/product-media\//, "")
    .replace(/^product-media\//, "");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jxveftfkpmzevjimxzce.supabase.co";
  return `${base}/storage/v1/object/public/product-media/${clean}`;
}

/**
 * Generates an instantaneous client-side 2D preview thumbnail of the customized machine
 * with the matte black chassis, door panel, customer artwork, and official CALVIN logo applied.
 */
function generateDesignThumbnailDataUrl(layers: CanvasLayer[], width = 280, height = 400): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Studio Backdrop (Warm ivory #F5F3EF)
  ctx.fillStyle = "#F5F3EF";
  ctx.fillRect(0, 0, width, height);

  // 2. Soft Ground Contact Shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(width / 2, height - 20, width * 0.38, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fill();
  ctx.restore();

  // Machine Chassis Bounding Dimensions
  const machX = 35;
  const machY = 25;
  const machW = width - 70;
  const machH = height - 60;

  // 3. Sturdy Rubber Base Feet
  ctx.fillStyle = "#0E0E12";
  ctx.fillRect(machX + 10, machY + machH - 2, 20, 8);
  ctx.fillRect(machX + machW - 30, machY + machH - 2, 20, 8);

  // 4. Main Cabinet Body (Matte charcoal/black powder-coat)
  const bodyGrad = ctx.createLinearGradient(machX, machY, machX + machW, machY);
  bodyGrad.addColorStop(0, "#1F1F26");
  bodyGrad.addColorStop(0.5, "#282832");
  bodyGrad.addColorStop(1, "#18181F");

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(machX, machY, machW, machH, [8, 8, 4, 4]);
  ctx.fill();

  // Outer cabinet bevel stroke
  ctx.strokeStyle = "#383844";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 5. Top Lid / Stainless Steel Hopper Accent
  ctx.fillStyle = "#454552";
  ctx.fillRect(machX + 8, machY + 2, machW - 16, 6);
  ctx.fillStyle = "#A8A8B4";
  ctx.fillRect(machX + 16, machY + 3, machW - 32, 2);

  // 6. Front Door Panel
  const doorX = machX + 12;
  const doorY = machY + 16;
  const doorW = machW - 24;
  const doorH = machH - 32;

  // Door background
  const doorGrad = ctx.createLinearGradient(doorX, doorY, doorX, doorY + doorH);
  doorGrad.addColorStop(0, "#191920");
  doorGrad.addColorStop(1, "#14141A");
  ctx.fillStyle = doorGrad;
  ctx.beginPath();
  ctx.roundRect(doorX, doorY, doorW, doorH, 4);
  ctx.fill();

  // Door edge bevel
  ctx.strokeStyle = "#2D2D38";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 7. Door Handle (Brushed stainless steel on right)
  const handleX = doorX + doorW - 8;
  const handleY = doorY + doorH * 0.35;
  const handleH = doorH * 0.28;
  ctx.fillStyle = "#8F909A";
  ctx.fillRect(handleX, handleY, 4, handleH);
  ctx.fillStyle = "#D4D4DC";
  ctx.fillRect(handleX + 1, handleY + 2, 2, handleH - 4);

  // 8. Printable Safe Area Sub-region inside Door
  const printMarginX = 6;
  const printMarginY = 8;
  const printX = doorX + printMarginX;
  const printY = doorY + printMarginY;
  const printW = doorW - printMarginX * 2 - 8; // Leave space for handle
  const printH = doorH - printMarginY * 2;

  // Clip artwork strictly inside the door panel area
  ctx.save();
  ctx.beginPath();
  ctx.rect(printX, printY, printW, printH);
  ctx.clip();

  // Draw customer layers in zIndex order
  const sorted = [...layers].filter((l) => l.visible).sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of sorted) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1.0;
    const lx = printX + layer.x * printW;
    const ly = printY + layer.y * printH;
    const lw = layer.width * printW;
    const lh = layer.height * printH;

    ctx.translate(lx + lw / 2, ly + lh / 2);
    if (layer.rotationDeg) {
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
    }

    if (layer.type === "photo") {
      const photoLayer = layer as { imageUrl: string; crop?: { x: number; y: number; width: number; height: number } };
      // Attempt to find cached or loaded img element in DOM
      const domImg = document.querySelector(`img[src="${photoLayer.imageUrl}"]`) as HTMLImageElement | null;
      if (domImg && domImg.complete && domImg.naturalWidth > 0) {
        if (photoLayer.crop) {
          const sx = Math.max(0, photoLayer.crop.x * domImg.naturalWidth);
          const sy = Math.max(0, photoLayer.crop.y * domImg.naturalHeight);
          const sw = Math.min(domImg.naturalWidth - sx, photoLayer.crop.width * domImg.naturalWidth);
          const sh = Math.min(domImg.naturalHeight - sy, photoLayer.crop.height * domImg.naturalHeight);
          ctx.drawImage(domImg, sx, sy, sw, sh, -lw / 2, -lh / 2, lw, lh);
        } else {
          ctx.drawImage(domImg, -lw / 2, -lh / 2, lw, lh);
        }
      } else {
        // High quality photo frame with subtle golden border
        ctx.fillStyle = "#2D3748";
        ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
        ctx.strokeStyle = "#D97706";
        ctx.lineWidth = 1;
        ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
        ctx.fillStyle = "#F7FAFC";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("📷 Bespoke Photo", 0, 3);
      }
    } else if (layer.type === "text") {
      const textL = layer as TextLayer;
      ctx.fillStyle = textL.fillColorHex || "#FFFFFF";
      const fontSize = Math.max(9, (textL.fontSizePt || 24) * (printH / 620));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = (textL.textAlign as CanvasTextAlign) || "center";
      ctx.textBaseline = "middle";
      ctx.fillText(textL.text || "", 0, 0);
    }
    ctx.restore();
  }
  ctx.restore(); // End door clipping

  // 9. Official CALVIN Brand Logo at Upper Center of Door
  const logoW = Math.min(68, doorW * 0.44);
  const logoH = logoW * (30 / 120);
  const logoX = doorX + (doorW - logoW) / 2;
  const logoY = doorY + 8;

  // Background badge plate
  ctx.fillStyle = "rgba(18, 18, 22, 0.95)";
  ctx.beginPath();
  ctx.roundRect(logoX - 4, logoY - 2, logoW + 8, logoH + 4, 3);
  ctx.fill();
  ctx.strokeStyle = "#D97706";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Try drawing the official transparent logo image from DOM
  const logoDom = document.querySelector(`img[src*="calvin-aatamaker-logo.png"]`) as HTMLImageElement | null;
  if (logoDom && logoDom.complete && logoDom.naturalWidth > 0) {
    ctx.drawImage(logoDom, logoX, logoY, logoW, logoH);
  } else {
    ctx.fillStyle = "#F59E0B";
    ctx.font = "bold 9px 'Cinzel', serif, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CALVIN", logoX + logoW / 2, logoY + logoH / 2);
  }

  // 10. Prototype Demonstration Badge in bottom corner
  ctx.fillStyle = "rgba(24, 24, 28, 0.85)";
  ctx.beginPath();
  ctx.roundRect(width - 94, height - 22, 86, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#F59E0B";
  ctx.font = "bold 8px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PROTOTYPE PREVIEW", width - 51, height - 14);

  return canvas.toDataURL("image/png");
}

function PersonalizationStudioContent() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;

  const initialVariantParam = searchParams.get("variant") || "";
  const initialQuantityParam = parseInt(searchParams.get("quantity") || "1", 10);
  const editDesignIdParam = searchParams.get("editDesignId") || "";

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantParam);
  const [quantity, setQuantity] = useState(Number.isNaN(initialQuantityParam) ? 1 : Math.max(1, initialQuantityParam));
  const [customValues, setCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [validationError, setValidationError] = useState("");
  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [savingDesign, setSavingDesign] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeDesignId, setActiveDesignId] = useState<string>(editDesignIdParam || "");
  const viewportRef = useRef<ViewportPreviewHandle>(null);

  // 3D Model & Printable Surface State
  const [activePreviewTab, setActivePreviewTab] = useState<"2d_studio" | "3d_orbit" | "photos">("3d_orbit");
  const [modelProfile, setModelProfile] = useState<Product3DModel | null>(null);
  const [surfaceProfile, setSurfaceProfile] = useState<ProductPrintableSurface | null>(null);
  const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>([]);

  const loadProduct = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");

    const selectFieldsWithConfig = `
      id,
      category_id,
      name,
      slug,
      sku,
      short_description,
      description,
      price,
      compare_at_price,
      stock_quantity,
      dimensions_cm,
      weight_kg,
      is_customisable,
      is_featured,
      customization_config,
      categories(name),
      product_images(
        id,
        storage_path,
        alt_text,
        is_primary,
        sort_order
      ),
      product_variants(
        id,
        name,
        sku,
        price,
        stock_quantity,
        options,
        is_active,
        sort_order
      )
    `;

    const selectFieldsWithoutConfig = `
      id,
      category_id,
      name,
      slug,
      sku,
      short_description,
      description,
      price,
      compare_at_price,
      stock_quantity,
      dimensions_cm,
      weight_kg,
      is_customisable,
      is_featured,
      categories(name),
      product_images(
        id,
        storage_path,
        alt_text,
        is_primary,
        sort_order
      ),
      product_variants(
        id,
        name,
        sku,
        price,
        stock_quantity,
        options,
        is_active,
        sort_order
      )
    `;

    try {
      let queryResult = await supabase
        .from("products")
        .select(selectFieldsWithConfig)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      // If the column customization_config is not yet migrated in Supabase, retry with base columns
      if (queryResult.error && queryResult.error.message.includes("customization_config")) {
        console.warn("customization_config column pending migration, querying base product columns:", queryResult.error.message);
        queryResult = await supabase
          .from("products")
          .select(selectFieldsWithoutConfig)
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();
      }

      // If requested slug didn't match directly, but slug is the demo alias, check if the real DB product exists with the generated suffix (e.g. compact-domestic-aatamaker-20c2f7)
      if (!queryResult.data && !queryResult.error && slug === "compact-domestic-aatamaker") {
        let altResult = await supabase
          .from("products")
          .select(selectFieldsWithConfig)
          .ilike("slug", "compact-domestic-aatamaker%")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (altResult.error && altResult.error.message.includes("customization_config")) {
          altResult = await supabase
            .from("products")
            .select(selectFieldsWithoutConfig)
            .ilike("slug", "compact-domestic-aatamaker%")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        }

        if (altResult.data) {
          queryResult = altResult;
        }
      }

      const { data, error: queryError } = queryResult;

      const isLocalDev =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          process.env.NODE_ENV === "development");
      const isDemoSlug =
        slug === "compact-domestic-aatamaker" || slug === "calvin-compact-01";

      if (queryError) {
        if (isLocalDev && isDemoSlug) {
          console.warn("Local dev fallback for demonstration slug due to DB error:", slug, queryError.message);
        } else {
          setError(`Unable to load customizable product: ${queryError.message}`);
          setLoading(false);
          return;
        }
      }

      if (!data) {
        if (!isLocalDev || !isDemoSlug) {
          setError("This product is unavailable or could not be found.");
          setLoading(false);
          return;
        }
      }

      let typedProduct: Product;

      if (!data) {
        console.warn("Customization product query fallback to demo catalog:", slug);
        const fallback = initialProducts.find((p) => p.slug === slug) || initialProducts[0];
        typedProduct = {
          id: fallback.id,
          category_id: null,
          name: fallback.name,
          slug: fallback.slug,
          sku: "CALVIN-COMPACT-01",
          short_description: fallback.description,
          description: fallback.description,
          price: fallback.price,
          compare_at_price: null,
          stock_quantity: fallback.stock,
          dimensions_cm: { height: "88", width: "48", depth: "34" },
          weight_kg: 45,
          is_customisable: true,
          is_featured: true,
          customization_config: DEFAULT_FALLBACK_CONFIG,
          categories: { name: fallback.category },
          product_images: [{ id: "img-1", storage_path: fallback.image, alt_text: fallback.name, is_primary: true, sort_order: 1 }],
          product_variants: [
            { id: "var-1", name: "Standard Domestic 1 HP", sku: "CALVIN-COMPACT-1HP", price: fallback.price, stock_quantity: 12, options: {}, is_active: true, sort_order: 1 },
            { id: "var-2", name: "Heavy Duty 1.25 HP", sku: "CALVIN-COMPACT-125HP", price: fallback.price + 2500, stock_quantity: 8, options: {}, is_active: true, sort_order: 2 },
          ],
        };
      } else {
        const sortedImages = [...(data.product_images ?? [])].sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });

        const sortedVariants = [...(data.product_variants ?? [])]
          .filter((v) => v.is_active)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        const rawData = data as Record<string, unknown>;
        typedProduct = {
          ...data,
          customization_config: (rawData.customization_config as ProductCustomizationConfig | null) ?? null,
          categories: (Array.isArray(data.categories) ? data.categories[0] : data.categories) as { name: string } | null,
          price: Number(data.price),
          compare_at_price: data.compare_at_price ? Number(data.compare_at_price) : null,
          stock_quantity: Number(data.stock_quantity),
          product_images: sortedImages,
          product_variants: sortedVariants,
        };
      }

      setProduct(typedProduct);

      // Fetch 3D Model and Printable Surface Profile
      try {
        const { data: modelData } = await supabase
          .from("product_3d_models")
          .select("*")
          .eq("product_id", typedProduct.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (modelData) {
          setModelProfile(modelData as Product3DModel);
          const { data: surfData } = await supabase
            .from("product_printable_surfaces")
            .select("*")
            .eq("model_id", modelData.id)
            .eq("surface_key", "front_door_panel")
            .maybeSingle();
          if (surfData) {
            setSurfaceProfile(surfData as ProductPrintableSurface);
          }
        } else {
          // Initialize fallback prototype profile for CALVIN-COMPACT-01
          setModelProfile({
            id: "m-compact-01",
            product_id: typedProduct.id,
            model_code: "CALVIN-COMPACT-01",
            name: "CALVIN Compact Domestic Flour Mill",
            version: 1,
            status: "draft",
            is_active: true,
            dimensions_mm: { width: 480, height: 880, depth: 340 },
            glb_storage_path: "/models/calvin-compact-01-prototype.glb",
            thumbnail_path: "/models/renders/perspective_3qtr.png",
            front_mesh_name: "Front_Print_Surface",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          setSurfaceProfile({
            id: "s-front-01",
            model_id: "m-compact-01",
            surface_key: "front_door_panel",
            surface_name: "Front Door Panel",
            mesh_target_name: "Front_Print_Surface",
            material_slot_name: "mat_front_print",
            physical_width_mm: 380,
            physical_height_mm: 620,
            safe_margins_mm: { top: 15, bottom: 25, left: 15, right: 15, bleed: 3 },
            fixed_branding: {
              enabled: true,
              locked: true,
              brand_text: "CALVIN",
              position: "top_center",
              offset_x_mm: 0,
              offset_y_mm: 35,
              width_mm: 120,
              height_mm: 30,
            },
            uv_mapping: { uv_channel: 0, u_min: 0, u_max: 1, v_min: 0, v_max: 1, flip_y: false, rotation_deg: 0 },
            cutout_zones: [],
            status: "calibrated",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (mErr) {
        console.warn("3D model registry lookup skipped or awaiting migration:", mErr);
      }

      // Check if variant parameter matches an available variant, otherwise select first in stock
      const availableVariants = typedProduct.product_variants || [];
      const matchedVariant = availableVariants.find((v) => v.id === initialVariantParam);
      if (matchedVariant) {
        setSelectedVariantId(matchedVariant.id);
      } else {
        const firstAvailable = availableVariants.find((v) => v.stock_quantity > 0) || availableVariants[0];
        if (firstAvailable) setSelectedVariantId(firstAvailable.id);
      }

      // Initialize default selections
      const config = typedProduct.customization_config?.enabled && typedProduct.customization_config?.fields?.length
        ? typedProduct.customization_config
        : DEFAULT_FALLBACK_CONFIG;

      const initialValues: Record<string, string | number | boolean | null> = {};
      for (const field of config.fields) {
        if (field.required && field.options && field.options.length > 0) {
          initialValues[field.id] = field.options[0].value;
        } else {
          initialValues[field.id] = "";
        }
      }
      setCustomValues(initialValues);

      const restoreDesignLayers = async (prod: Product) => {
        if (typeof window === "undefined") return;
        try {
          const rawSaved = localStorage.getItem("calvin-customer-designs");
          let loadedLayers: CanvasLayer[] | null = null;
          let loadedOptions: Record<string, string | number | boolean | null> | null = null;
          let loadedDesignId: string | null = null;

          if (rawSaved) {
            const parsed = JSON.parse(rawSaved) as Record<
              string,
              {
                layers?: CanvasLayer[];
                options?: Record<string, string | number | boolean | null>;
                designId?: string;
              }
            >;
            const targetDesign = editDesignIdParam
              ? parsed[editDesignIdParam]
              : (parsed[prod.id] ||
                 parsed[prod.slug] ||
                 (slug ? parsed[slug] : null) ||
                 parsed["327d5d70-ec43-4d28-9aff-cd1de77a23c5"] ||
                 parsed["aat-001"]);
            if (targetDesign && Array.isArray(targetDesign.layers)) {
              loadedLayers = targetDesign.layers;
              loadedOptions = targetDesign.options || null;
              loadedDesignId = targetDesign.designId || null;
            }
          }

          // If not in localStorage, check Supabase customer_designs for authenticated customer
          if (!loadedLayers) {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const query = supabase
                  .from("customer_designs")
                  .select("id, design_data")
                  .eq("customer_id", user.id)
                  .order("updated_at", { ascending: false });

                if (editDesignIdParam) {
                  query.eq("id", editDesignIdParam);
                } else {
                  query.eq("product_id", prod.id).limit(1);
                }

                const { data: dbDesigns } = await query;
                if (dbDesigns && dbDesigns.length > 0) {
                  const dbDesign = dbDesigns[0];
                  const data = dbDesign.design_data as {
                    layers?: CanvasLayer[];
                    options?: Record<string, string | number | boolean | null>;
                  };
                  if (data?.layers && Array.isArray(data.layers)) {
                    loadedLayers = data.layers;
                    loadedOptions = data.options || null;
                    loadedDesignId = dbDesign.id;
                  }
                }
              }
            } catch (dbErr) {
              console.warn("Could not check customer_designs:", dbErr);
            }
          }

          if (loadedLayers && Array.isArray(loadedLayers)) {
            // Re-resolve permanent storage paths to fresh signed URLs so expired tokens never break canvas
            const restoredLayers: CanvasLayer[] = loadedLayers.map((l) => {
              if (l.type === "photo") {
                const p = l as PhotoLayer;
                const permanentPath = p.storagePath || extractStoragePath(p.imageUrl) || "";
                const freshUrl = resolveCustomizationAssetUrl(permanentPath || p.imageUrl);
                return {
                  ...p,
                  storagePath: permanentPath || p.storagePath,
                  imageUrl: freshUrl || p.imageUrl,
                };
              }
              return l;
            });

            setCanvasLayers(restoredLayers);
            if (loadedOptions) {
              setCustomValues((prev) => ({ ...prev, ...loadedOptions }));
            }
            if (loadedDesignId) {
              setActiveDesignId(loadedDesignId);
            }
          }
        } catch (e) {
          console.warn("Could not load cached design:", e);
        }
      };

      // Restore saved design from localStorage if editDesignId exists or prior session was cached
      await restoreDesignLayers(typedProduct);
    } catch (err: unknown) {
      const isLocalDev =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          process.env.NODE_ENV === "development");
      const isDemoSlug =
        slug === "compact-domestic-aatamaker" || slug === "calvin-compact-01";

      if (isLocalDev && isDemoSlug) {
        console.warn("Failed to query product for customization from Supabase, applying fallback demo setup:", err);
        const fallback = initialProducts.find((p) => p.slug === slug) || initialProducts[0];
        if (fallback) {
        const typedProduct: Product = {
          id: fallback.id,
          category_id: null,
          name: fallback.name,
          slug: fallback.slug,
          sku: "CALVIN-COMPACT-01",
          short_description: fallback.description,
          description: fallback.description,
          price: fallback.price,
          compare_at_price: null,
          stock_quantity: fallback.stock,
          dimensions_cm: { height: "88", width: "48", depth: "34" },
          weight_kg: 45,
          is_customisable: true,
          is_featured: true,
          customization_config: DEFAULT_FALLBACK_CONFIG,
          categories: { name: fallback.category },
          product_images: [{ id: "img-1", storage_path: fallback.image, alt_text: fallback.name, is_primary: true, sort_order: 1 }],
          product_variants: [
            { id: "var-1", name: "Standard Domestic 1 HP", sku: "CALVIN-COMPACT-1HP", price: fallback.price, stock_quantity: 12, options: {}, is_active: true, sort_order: 1 },
            { id: "var-2", name: "Heavy Duty 1.25 HP", sku: "CALVIN-COMPACT-125HP", price: fallback.price + 2500, stock_quantity: 8, options: {}, is_active: true, sort_order: 2 },
          ],
        };
        setProduct(typedProduct);
        setSelectedVariantId("var-1");
        setModelProfile({
          id: "m-compact-01",
          product_id: typedProduct.id,
          model_code: "CALVIN-COMPACT-01",
          name: "CALVIN Compact Domestic Flour Mill",
          version: 1,
          status: "draft",
          is_active: true,
          dimensions_mm: { width: 480, height: 880, depth: 340 },
          glb_storage_path: "/models/calvin-compact-01-prototype.glb",
          thumbnail_path: "/models/renders/perspective_3qtr.png",
          front_mesh_name: "Front_Print_Surface",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setSurfaceProfile({
          id: "s-front-01",
          model_id: "m-compact-01",
          surface_key: "front_door_panel",
          surface_name: "Front Door Panel",
          mesh_target_name: "Front_Print_Surface",
          material_slot_name: "mat_front_print",
          physical_width_mm: 380,
          physical_height_mm: 620,
          safe_margins_mm: { top: 15, bottom: 25, left: 15, right: 15, bleed: 3 },
          fixed_branding: {
            enabled: true,
            locked: true,
            brand_text: "CALVIN",
            position: "top_center",
            offset_x_mm: 0,
            offset_y_mm: 35,
            width_mm: 120,
            height_mm: 30,
          },
          uv_mapping: { uv_channel: 0, u_min: 0, u_max: 1, v_min: 0, v_max: 1, flip_y: false, rotation_deg: 0 },
          cutout_zones: [],
          status: "calibrated",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Initialize default option selections for fallback
        const fbConfig = typedProduct.customization_config?.enabled && typedProduct.customization_config?.fields?.length
          ? typedProduct.customization_config
          : DEFAULT_FALLBACK_CONFIG;
        const fbInitialValues: Record<string, string | number | boolean | null> = {};
        for (const field of fbConfig.fields) {
          if (field.required && field.options && field.options.length > 0) {
            fbInitialValues[field.id] = field.options[0].value;
          } else {
            fbInitialValues[field.id] = "";
          }
        }
        setCustomValues(fbInitialValues);

        // Restore saved layers in fallback mode
        if (typeof window !== "undefined") {
          try {
            const rawSaved = localStorage.getItem("calvin-customer-designs");
            if (rawSaved) {
              const parsed = JSON.parse(rawSaved) as Record<
                string,
                {
                  layers?: CanvasLayer[];
                  options?: Record<string, string | number | boolean | null>;
                  designId?: string;
                }
              >;
              const targetDesign = editDesignIdParam
                ? parsed[editDesignIdParam]
                : (parsed[typedProduct.id] ||
                   parsed[typedProduct.slug] ||
                   (slug ? parsed[slug] : null) ||
                   parsed["327d5d70-ec43-4d28-9aff-cd1de77a23c5"] ||
                   parsed["aat-001"]);
              if (targetDesign && Array.isArray(targetDesign.layers)) {
                const restoredLayers: CanvasLayer[] = targetDesign.layers.map((l) => {
                  if (l.type === "photo") {
                    const p = l as PhotoLayer;
                    const permanentPath = p.storagePath || extractStoragePath(p.imageUrl) || "";
                    const freshUrl = resolveCustomizationAssetUrl(permanentPath || p.imageUrl);
                    return {
                      ...p,
                      storagePath: permanentPath || p.storagePath,
                      imageUrl: freshUrl || p.imageUrl,
                    };
                  }
                  return l;
                });
                setCanvasLayers(restoredLayers);
                if (targetDesign.options) {
                  setCustomValues((prev) => ({ ...prev, ...targetDesign.options }));
                }
                if (targetDesign.designId) {
                  setActiveDesignId(targetDesign.designId);
                }
              }
            }
          } catch (e) {
            console.warn("Could not load cached design in fallback mode:", e);
          }
        }
        return;
      }
    }
    setError("Unable to load product personalization studio. Please try again.");
  } finally {
      setLoading(false);
    }
  }, [slug, initialVariantParam, editDesignIdParam]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  // Selected variant details
  const selectedVariant = useMemo(() => {
    if (!product || !selectedVariantId) return null;
    return product.product_variants.find((v) => v.id === selectedVariantId) || null;
  }, [product, selectedVariantId]);

  // Resolved customization configuration
  const activeConfig: ProductCustomizationConfig = useMemo(() => {
    if (product?.customization_config?.enabled && product.customization_config.fields?.length) {
      return product.customization_config;
    }
    return DEFAULT_FALLBACK_CONFIG;
  }, [product]);

  // Price calculations
  const basePrice = selectedVariant?.price !== null && selectedVariant?.price !== undefined
    ? Number(selectedVariant.price)
    : Number(product?.price || 0);

  const customizationPriceDelta = useMemo(() => {
    return computeCustomizationPriceDelta(activeConfig, customValues);
  }, [activeConfig, customValues]);

  const finalUnitPrice = basePrice + customizationPriceDelta;
  const currentStock = selectedVariant ? selectedVariant.stock_quantity : (product?.stock_quantity ?? 0);
  const isAvailable = currentStock > 0;

  function handleFieldValueChange(fieldId: string, val: string | number | boolean | null) {
    setCustomValues((prev) => ({ ...prev, [fieldId]: val }));
    setValidationError("");
  }

  function handleReset() {
    const resetValues: Record<string, string | number | boolean | null> = {};
    for (const field of activeConfig.fields) {
      if (field.required && field.options && field.options.length > 0) {
        resetValues[field.id] = field.options[0].value;
      } else {
        resetValues[field.id] = "";
      }
    }
    setCustomValues(resetValues);
    setCanvasLayers([]);
    setValidationError("");
    showToast("Design reset to standard factory finish.");
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  /**
   * Uploads canvas thumbnail to Supabase Storage via secure server upload API.
   * Returns clean signed URL and permanent storage path, falling back gracefully to dataUrl.
   */
  async function uploadPreviewToStorage(
    dataUrl: string,
    designId: string
  ): Promise<{ url: string; storagePath: string }> {
    if (!dataUrl || !dataUrl.startsWith("data:")) return { url: dataUrl, storagePath: dataUrl };
    try {
      const res = await fetch("/api/customizations/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "preview",
          dataUrl,
          designId,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.url === "string" && json.url.length > 0) {
          return {
            url: json.url,
            storagePath: typeof json.storagePath === "string" ? json.storagePath : json.url,
          };
        }
      }
    } catch (err) {
      console.warn("Preview storage upload fallback to local dataUrl:", err);
    }
    return { url: dataUrl, storagePath: "" };
  }

  /**
   * Uploads canonical flat artwork (380x620mm surface) to Supabase Storage via secure server upload API.
   * Returns clean signed URL and permanent storage path, falling back gracefully to dataUrl.
   */
  async function uploadArtworkToStorage(
    dataUrl: string,
    designId: string
  ): Promise<{ url: string; storagePath: string }> {
    if (!dataUrl || !dataUrl.startsWith("data:")) return { url: dataUrl, storagePath: dataUrl };
    try {
      const res = await fetch("/api/customizations/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "artwork",
          dataUrl,
          designId,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.url === "string" && json.url.length > 0) {
          return {
            url: json.url,
            storagePath: typeof json.storagePath === "string" ? json.storagePath : json.url,
          };
        }
      }
    } catch (err) {
      console.warn("Artwork storage upload fallback to local dataUrl:", err);
    }
    return { url: dataUrl, storagePath: "" };
  }

  /**
   * Persists design to local storage and Supabase customer_designs (when authenticated).
   * Stores permanent storage path rather than temporary signed URL.
   */
  async function persistDesignRecord(
    designId: string,
    previewUrl: string,
    storagePath?: string,
    artworkPath?: string
  ) {
    if (!product) return;
    try {
      const permanentPath = storagePath || previewUrl;
      const persistentLayers = canvasLayers.map((l) => {
        if (l.type === "photo") {
          const p = l as PhotoLayer;
          const extracted = p.storagePath || extractStoragePath(p.imageUrl) || "";
          return {
            ...p,
            storagePath: extracted || p.storagePath,
          };
        }
        return l;
      });

      const designDoc = {
        designId,
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        modelCode: modelProfile?.model_code || "CALVIN-COMPACT-01",
        surfaceKey: surfaceProfile?.surface_key || "front_door_panel",
        layers: persistentLayers,
        options: customValues,
        mode: "demonstration",
        previewUrl,
        storagePath: permanentPath,
        artworkPath: artworkPath || null,
        updatedAt: new Date().toISOString(),
      };

      // Save to localStorage
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("calvin-customer-designs");
        const store = raw ? JSON.parse(raw) : {};
        store[designId] = designDoc;
        store[product.id] = designDoc; // latest for product
        if (product.slug) {
          store[product.slug] = designDoc;
        }
        localStorage.setItem("calvin-customer-designs", JSON.stringify(store));
      }

      // If user is authenticated, save to Supabase customer_designs
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("customer_designs").upsert({
          id: designId,
          customer_id: user.id,
          product_id: product.id,
          model_id: modelProfile?.id || null,
          surface_id: surfaceProfile?.id || null,
          design_title: `${product.name} Custom Prototype Design`,
          design_data: {
            version: 1,
            model_code: modelProfile?.model_code || "CALVIN-COMPACT-01",
            surface_key: surfaceProfile?.surface_key || "front_door_panel",
            layers: persistentLayers,
            options: customValues,
            mode: "demonstration",
            flat_artwork_path: artworkPath || null,
          },
          preview_thumbnail_path: permanentPath,
          status: "cart",
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("Design persistence background warning:", err);
    }
  }

  async function handleSaveDesign() {
    if (!product) return;
    setSavingDesign(true);
    const designId = activeDesignId || crypto.randomUUID();
    setActiveDesignId(designId);

    // 1. Capture actual 3D WebGL render of the machine with customer design
    let rawPreview = "";
    try {
      if (viewportRef.current) {
        const snap = await viewportRef.current.capture3DSnapshot();
        if (snap) rawPreview = snap;
      }
    } catch (e) {
      console.warn("3D snapshot capture error during save:", e);
    }
    if (!rawPreview) {
      rawPreview = generateDesignThumbnailDataUrl(canvasLayers);
    }

    // 2. Capture canonical flat artwork (380x620 mm door panel)
    let rawArtwork = "";
    try {
      if (viewportRef.current?.captureFlatArtworkSnapshot) {
        const snap = await viewportRef.current.captureFlatArtworkSnapshot();
        if (snap) rawArtwork = snap;
      }
    } catch (e) {
      console.warn("Flat artwork snapshot capture error during save:", e);
    }
    if (!rawArtwork) {
      rawArtwork = await renderCanonicalFlatArtworkDataUrl(canvasLayers, {
        finish: (customValues.front_panel_finish as string) || "matte_black",
      });
    }

    const [previewResult, artworkResult] = await Promise.all([
      uploadPreviewToStorage(rawPreview, designId),
      uploadArtworkToStorage(rawArtwork, designId),
    ]);

    await persistDesignRecord(
      designId,
      previewResult.url,
      previewResult.storagePath,
      artworkResult.storagePath
    );
    setSavingDesign(false);
    showToast("✓ Custom design saved successfully!");
  }

  async function executeAddToCartOrBuyNow(isBuyNow = false) {
    if (!product) return;

    // Validate submission against authoritative schema
    const validation = validateCustomizationSubmission(activeConfig, customValues);
    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    if (isBuyNow) setBuyingNow(true);
    else setAddingToCart(true);
    setValidationError("");

    try {
      const savedItems = readSavedCart();
      const variant = selectedVariant;
      const cleanVariantId = variant?.id ?? null;

      // Compute deterministic design fingerprint of the current canvas artwork & options
      const currentFingerprint = computeDesignFingerprint(
        product.id,
        cleanVariantId,
        canvasLayers,
        customValues
      );

      // Check if an existing cart line item ALREADY has this exact design fingerprint
      const existingMatchingItem = savedItems.find(
        (it) =>
          it.isCustomized &&
          it.productId === product.id &&
          (it.variantId ?? null) === cleanVariantId &&
          it.customisationDetails?._design_fingerprint === currentFingerprint
      );

      // Rule B: If the exact same customization already exists in the cart, reuse its designId
      // Rule C: If the design was edited or is new, generate a fresh immutable designId
      const designId = existingMatchingItem?.designId || crypto.randomUUID();
      setActiveDesignId(designId);

      // 1. Capture actual 3D WebGL render of the machine with customer design
      let rawPreview = "";
      try {
        if (viewportRef.current) {
          const snap = await viewportRef.current.capture3DSnapshot();
          if (snap) rawPreview = snap;
        }
      } catch (e) {
        console.warn("3D snapshot capture error during add to cart:", e);
      }
      if (!rawPreview) {
        rawPreview = generateDesignThumbnailDataUrl(canvasLayers);
      }

      // 2. Capture canonical flat artwork (380x620 mm door panel)
      let rawArtwork = "";
      try {
        if (viewportRef.current?.captureFlatArtworkSnapshot) {
          const snap = await viewportRef.current.captureFlatArtworkSnapshot();
          if (snap) rawArtwork = snap;
        }
      } catch (e) {
        console.warn("Flat artwork snapshot capture error during add to cart:", e);
      }
      if (!rawArtwork) {
        rawArtwork = await renderCanonicalFlatArtworkDataUrl(canvasLayers, {
          finish: (validation.cleanValues.front_panel_finish as string) || "matte_black",
        });
      }

      // Upload both visual snapshots in parallel
      const [previewResult, artworkResult] = await Promise.all([
        uploadPreviewToStorage(rawPreview, designId),
        uploadArtworkToStorage(rawArtwork, designId),
      ]);
      const previewThumbnail = previewResult.url;

      // Build complete, immutable customization snapshot
      const snapshot = buildImmutableCustomizationSnapshot({
        designId,
        designFingerprint: currentFingerprint,
        mode: "demonstration",
        modelCode: modelProfile?.model_code || "CALVIN-COMPACT-01",
        surfaceKey: surfaceProfile?.surface_key || "front_door_panel",
        surfaceDimensionsMm: {
          width: surfaceProfile?.physical_width_mm || 380,
          height: surfaceProfile?.physical_height_mm || 620,
        },
        layers: canvasLayers as unknown as Array<Record<string, unknown>>,
        options: validation.cleanValues,
        priceDelta: customizationPriceDelta,
        summary: formatCustomisationSummary(validation.cleanValues),
        previewStoragePath: previewResult.storagePath || "",
        previewImage: previewResult.url,
        flatArtworkStoragePath: artworkResult.storagePath || "",
        flatArtworkUrl: artworkResult.url,
      });

      // Persist design snapshot
      await persistDesignRecord(
        designId,
        previewResult.url,
        previewResult.storagePath,
        artworkResult.storagePath
      );

      const cleanCustomDetails: Record<string, string | number | boolean | null> = {
        ...validation.cleanValues,
        _design_id: designId,
        _design_fingerprint: currentFingerprint,
        _model_code: modelProfile?.model_code || "CALVIN-COMPACT-01",
        _surface_key: surfaceProfile?.surface_key || "front_door_panel",
        _layers_count: canvasLayers.filter((l) => l.visible).length,
        _mode: "demonstration",
        _preview_storage_path: previewResult.storagePath || "",
        _preview_thumbnail_path: previewResult.storagePath || "",
        _preview_image: previewResult.url,
        _flat_artwork_path: artworkResult.storagePath || "",
        _flat_artwork_storage_path: artworkResult.storagePath || "",
        _flat_artwork_url: artworkResult.url,
        _customization_summary: `${canvasLayers.filter((l) => l.visible).length} Custom Layer(s)`,
        _snapshot: JSON.stringify(snapshot),
        _snapshot_version: 1,
      };

      const summary = formatCustomisationSummary(cleanCustomDetails);

      const cartItemId = generateCartItemId(
        product.id,
        cleanVariantId,
        cleanCustomDetails,
        designId
      );

      const existingIndex = savedItems.findIndex((it) => it.id === cartItemId);
      let nextItems: CartItem[];

      const newItem: CartItem = {
        id: cartItemId,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: previewThumbnail || (product.product_images[0]?.storage_path ? storageImageUrl(product.product_images[0]?.storage_path) : null),
        unitPrice: finalUnitPrice,
        baseUnitPrice: basePrice,
        customisationPriceDelta: customizationPriceDelta,
        customisationSummary: summary,
        quantity,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        sku: variant?.sku ?? product.sku,
        customisationDetails: cleanCustomDetails,
        availableStock: currentStock,
        isCustomized: true,
        designId,
        modelCode: modelProfile?.model_code || "CALVIN-COMPACT-01",
        modelVersion: modelProfile?.version || 1,
        surfaceKey: surfaceProfile?.surface_key || "front_door_panel",
        customPreviewUrl: previewThumbnail,
        customizationMode: "demonstration",
      };

      if (existingIndex >= 0) {
        nextItems = savedItems.map((it, idx) =>
          idx === existingIndex
            ? {
                ...it,
                quantity: Math.min(currentStock, it.quantity + quantity),
                unitPrice: finalUnitPrice,
                baseUnitPrice: basePrice,
                customisationPriceDelta: customizationPriceDelta,
                customisationSummary: summary,
                customPreviewUrl: previewThumbnail,
                customisationDetails: cleanCustomDetails,
              }
            : it
        );
      } else {
        nextItems = [...savedItems, newItem];
      }

      saveCart(nextItems);

      if (isBuyNow) {
        router.push("/checkout");
      } else {
        showToast("✓ Customized aatamaker added to your cart!");
        setTimeout(() => {
          router.push("/cart");
        }, 600);
      }
    } catch (err: unknown) {
      console.error("Failed to add customized item to cart:", err);
      setValidationError("Failed to add to cart. Please try again.");
    } finally {
      setAddingToCart(false);
      setBuyingNow(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
        <StorefrontHeader />
        <div className="flex flex-1 items-center justify-center py-24 text-stone-500">
          <LoaderCircle size={28} className="animate-spin text-[#b91f32] mr-3" />
          <span className="text-sm font-medium">Opening Personalisation Studio…</span>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
        <StorefrontHeader />
        <div className="mx-auto max-w-xl py-20 px-4 text-center">
          <Package size={48} className="mx-auto text-stone-400 mb-4" />
          <h2 className="text-lg font-bold text-stone-800">Product Studio Unavailable</h2>
          <p className="mt-2 text-xs text-stone-500">{error || "Product not found."}</p>
          <Link
            href="/products"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft size={14} /> Back to Catalogue
          </Link>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
      <StorefrontHeader />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-5 z-50 rounded-xl bg-stone-900 text-white px-4 py-3 shadow-2xl flex items-center gap-2 border border-stone-700 animate-slide-in">
          <BookmarkCheck size={16} className="text-emerald-400" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 py-6 sm:py-8 flex-1">
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <Link
              href={`/products/${product.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition"
            >
              <ArrowLeft size={14} />
              Back to Product Overview
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-bold text-stone-800">
              Personalisation Studio
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDesign}
              disabled={savingDesign}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs"
            >
              {savingDesign ? <LoaderCircle size={13} className="animate-spin text-amber-600" /> : <Save size={13} />}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition shadow-xs"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Studio Main Workspace Grid */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Interactive 2D & 3D Visualizer */}
          <section className="lg:col-span-7 xl:col-span-7 space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
              {/* Viewport Mode Switcher Tabs */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActivePreviewTab("3d_orbit")}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      activePreviewTab === "3d_orbit"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <Rotate3d size={14} />
                    <span>3D Orbit View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePreviewTab("2d_studio")}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      activePreviewTab === "2d_studio"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <Palette size={14} />
                    <span>2D Surface Editor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePreviewTab("photos")}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      activePreviewTab === "photos"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <Camera size={14} />
                    <span>Reference Photos</span>
                  </button>
                </div>

                <span className="hidden sm:inline-block text-[10px] font-mono font-semibold text-stone-500">
                  {surfaceProfile ? `${surfaceProfile.physical_width_mm}×${surfaceProfile.physical_height_mm} mm` : "380×620 mm"}
                </span>
              </div>

              {/* Viewport Content */}
              {activePreviewTab === "2d_studio" && (
                <div className="mt-4">
                  <EditorCanvas
                    surfaceWidthMm={surfaceProfile?.physical_width_mm || 380}
                    surfaceHeightMm={surfaceProfile?.physical_height_mm || 620}
                    safeMarginsMm={surfaceProfile?.safe_margins_mm || { top: 15, bottom: 25, left: 15, right: 15, bleed: 3 }}
                    branding={surfaceProfile?.fixed_branding || {
                      enabled: true,
                      locked: true,
                      brand_text: "CALVIN",
                      position: "top_center",
                      offset_x_mm: 0,
                      offset_y_mm: 35,
                      width_mm: 120,
                      height_mm: 30,
                    }}
                    initialLayers={canvasLayers}
                    onLayersChange={setCanvasLayers}
                  />
                </div>
              )}

              {/* ViewportPreview stays rendered so WebGL context remains warm and capture3DSnapshot is available */}
              <div
                className={
                  activePreviewTab === "3d_orbit"
                    ? "mt-4 block"
                    : "fixed -left-[9999px] top-0 pointer-events-none w-[640px] h-[640px] opacity-0"
                }
                aria-hidden={activePreviewTab !== "3d_orbit"}
              >
                <ViewportPreview
                  ref={viewportRef}
                  model={modelProfile}
                  surface={surfaceProfile}
                  layers={canvasLayers}
                />
              </div>

              {activePreviewTab === "photos" && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-600 flex items-center gap-2">
                    <Info size={14} className="text-amber-600 shrink-0" />
                    <span className="font-medium">
                      Reference Images — Final product images will be updated after physical model verification.
                    </span>
                  </div>
                  <div className="relative flex min-h-[360px] items-center justify-center rounded-2xl bg-[#f8f5ef] p-6">
                  {product.product_images.length > 0 ? (
                    <Image
                      src={storageImageUrl(product.product_images[selectedImage]?.storage_path)}
                      alt={product.product_images[selectedImage]?.alt_text || product.name}
                      width={560}
                      height={560}
                      priority
                      className="max-h-[380px] w-auto object-contain transition-all duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-stone-400">
                      <Package size={48} strokeWidth={1.5} />
                      <span className="mt-2 text-xs">Machine reference photo</span>
                    </div>
                  )}

                  {product.product_images.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-xl bg-white/80 backdrop-blur-xs border border-stone-200">
                      {product.product_images.map((img, idx) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setSelectedImage(idx)}
                          className={`h-10 w-10 rounded-lg overflow-hidden border transition ${
                            selectedImage === idx ? "border-amber-600 ring-2 ring-amber-500/20" : "border-stone-200 opacity-60"
                          }`}
                        >
                          <Image
                            src={storageImageUrl(img.storage_path)}
                            alt=""
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* Demonstration Prototype Mode Notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldCheck size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-amber-900 block">Demonstration Prototype Studio</span>
                <span>
                  Interactive 3D personalization uses the CALVIN-COMPACT-01 prototype (provisional dimensions: 480 × 340 × 880 mm). All customer text and photo layouts are rendered onto the 3D model surface in real time and preserved during checkout.
                </span>
              </div>
            </div>
          </section>

          {/* Right Column: Customization Controls & Actions */}
          <section className="lg:col-span-5 xl:col-span-5 space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs space-y-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-700">
                  <Wheat size={12} className="text-amber-600" />
                  {product.categories?.name || "Domestic Aatamaker"}
                </span>

                <h1 className="mt-2 text-xl sm:text-2xl font-bold text-stone-900">
                  {product.name}
                </h1>

                <p className="mt-1 text-xs text-stone-500">
                  {product.short_description || "Bespoke stone-ground domestic flour mill with custom cabinet artwork."}
                </p>
              </div>

              {/* Price Breakdown Card */}
              <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-stone-500">Base Machine Price</span>
                  <span className="font-mono text-sm text-stone-700">{formatINR(basePrice)}</span>
                </div>

                {customizationPriceDelta > 0 && (
                  <div className="flex items-baseline justify-between text-amber-800">
                    <span className="text-xs flex items-center gap-1">
                      <Sparkles size={11} className="text-amber-600" />
                      Personalization Options
                    </span>
                    <span className="font-mono text-sm font-semibold">+{formatINR(customizationPriceDelta)}</span>
                  </div>
                )}

                <div className="border-t border-stone-200/80 pt-2 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-stone-900">Total Unit Price</span>
                  <span className="text-xl font-bold text-stone-900 font-mono">{formatINR(finalUnitPrice)}</span>
                </div>
              </div>

              {/* Variant Selector */}
              {product.product_variants.length > 0 && (
                <div>
                  <label htmlFor="variant-select" className="block text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">
                    Machine Model / Variant
                  </label>
                  <div className="relative">
                    <select
                      id="variant-select"
                      value={selectedVariantId}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-800 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-50"
                    >
                      {product.product_variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.price ? `(${formatINR(Number(v.price))})` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  </div>
                </div>
              )}

              {/* Customization Fields */}
              <div className="space-y-4 border-t border-stone-100 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Customization Specifications
                </h3>

                {activeConfig.fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={field.id} className="font-bold text-stone-800">
                        {field.label}
                        {field.required && <span className="text-red-600 ml-0.5">*</span>}
                      </label>
                      {field.max_length && (
                        <span className="text-[10px] text-stone-400 font-mono">
                          {String(customValues[field.id] || "").length}/{field.max_length}
                        </span>
                      )}
                    </div>

                    {field.help_text && (
                      <p className="text-[11px] text-stone-500">{field.help_text}</p>
                    )}

                    {/* Swatch Type */}
                    {field.type === "swatch" && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {field.options?.map((opt) => {
                          const isSelected = customValues[field.id] === opt.value;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleFieldValueChange(field.id, opt.value)}
                              className={`flex items-center gap-2 p-2 rounded-xl border text-left transition ${
                                isSelected
                                  ? "border-amber-600 bg-amber-50/50 shadow-xs"
                                  : "border-stone-200 hover:border-stone-300 bg-white"
                              }`}
                            >
                              <span
                                className="h-5 w-5 rounded-md border border-stone-300 shrink-0"
                                style={{ backgroundColor: opt.swatch_color || "#222" }}
                              />
                              <div className="min-w-0 flex-1">
                                <span className="block text-[11px] font-semibold text-stone-800 truncate">
                                  {opt.label}
                                </span>
                                {opt.price_delta > 0 && (
                                  <span className="block text-[10px] text-amber-700 font-mono">
                                    +{formatINR(opt.price_delta)}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Select Type */}
                    {field.type === "select" && (
                      <div className="relative">
                        <select
                          id={field.id}
                          value={String(customValues[field.id] || "")}
                          onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                          className="w-full appearance-none rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-medium text-stone-800 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-50"
                        >
                          <option value="">Select option…</option>
                          {field.options?.map((opt) => (
                            <option key={opt.id} value={opt.value}>
                              {opt.label} {opt.price_delta > 0 ? `(+${formatINR(opt.price_delta)})` : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      </div>
                    )}

                    {/* Text Type */}
                    {field.type === "text" && (
                      <input
                        id={field.id}
                        type="text"
                        maxLength={field.max_length || 50}
                        placeholder={field.help_text || "Enter custom inscription…"}
                        value={String(customValues[field.id] || "")}
                        onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs text-stone-800 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-50"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Quantity Picker */}
              <div className="flex items-center justify-between border-t border-stone-100 pt-4">
                <span className="text-xs font-bold text-stone-800 uppercase tracking-wider">Quantity</span>
                <div className="flex items-center border border-stone-300 rounded-xl bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40 text-sm font-bold"
                  >
                    -
                  </button>
                  <span className="px-3 py-1.5 text-xs font-bold font-mono min-w-8 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}
                    disabled={quantity >= currentStock}
                    className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-40 text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Validation Feedback */}
              {validationError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 flex items-center gap-2">
                  <Info size={15} className="shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Action Buttons: Add to Cart & Buy Now */}
              <div className="space-y-2.5 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={!isAvailable || addingToCart || buyingNow}
                  onClick={() => executeAddToCartOrBuyNow(false)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-700 py-3.5 px-6 text-sm font-bold text-white shadow-sm hover:bg-red-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingToCart ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" />
                      <span>Saving Customized Cart Item…</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={17} />
                      <span>Add Customized Product to Cart · {formatINR(finalUnitPrice * quantity)}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!isAvailable || addingToCart || buyingNow}
                  onClick={() => executeAddToCartOrBuyNow(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-stone-900 bg-white py-3 px-6 text-sm font-bold text-stone-900 shadow-sm hover:bg-stone-900 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buyingNow ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" />
                      <span>Proceeding to Checkout…</span>
                    </>
                  ) : (
                    <>
                      <Zap size={17} />
                      <span>Buy Customized Product Now</span>
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] text-stone-400">
                  Each personalized unit is individually built and bench-calibrated before delivery.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <StorefrontFooter />
    </div>
  );
}

export default function PersonalizationStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--paper)] flex flex-col justify-between">
          <StorefrontHeader />
          <div className="flex flex-1 items-center justify-center py-24 text-stone-500">
            <LoaderCircle size={28} className="animate-spin text-[#b91f32] mr-3" />
            <span className="text-sm font-medium">Opening Personalisation Studio…</span>
          </div>
          <StorefrontFooter />
        </div>
      }
    >
      <PersonalizationStudioContent />
    </Suspense>
  );
}
