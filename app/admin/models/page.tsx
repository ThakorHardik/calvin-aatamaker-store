"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Box,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AssetIntakeDialog } from "@/components/admin/asset-intake-dialog";
import type {
  Product3DModel,
  ProductPrintableSurface,
  ModelLifecycleStatus,
} from "@/types/3d-model";
import type { ModelAssetIntakeManifest } from "@/types/asset-intake";
import {
  createInitialCompactIntakeManifest,
  parseIntakeManifest,
} from "@/lib/3d/asset-intake";
import {
  evaluateModelReadiness,
  encodeChecklistInNotes,
  parseChecklistFromNotes,
} from "@/lib/3d/model-readiness";

interface ProductOption {
  id: string;
  name: string;
  slug: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<Product3DModel[]>([]);
  const [surfaces, setSurfaces] = useState<Record<string, ProductPrintableSurface>>({});
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Product3DModel | null>(null);
  const [uploadingGlb, setUploadingGlb] = useState(false);
  const [saving, setSaving] = useState(false);

  // Asset Intake Modal State
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [targetIntakeModel, setTargetIntakeModel] = useState<Product3DModel | null>(null);
  const [currentIntakeManifest, setCurrentIntakeManifest] = useState<ModelAssetIntakeManifest>(
    createInitialCompactIntakeManifest()
  );

  // Form Fields
  const [formModelCode, setFormModelCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formProductId, setFormProductId] = useState<string>("");
  const [formVersion, setFormVersion] = useState<number>(1);
  const [formStatus, setFormStatus] = useState<ModelLifecycleStatus>("draft");
  const [formIsActive, setFormIsActive] = useState(false);
  const [formGlbPath, setFormGlbPath] = useState<string>("");
  const [formFrontMeshName, setFormFrontMeshName] = useState("Front_Print_Surface");
  const [formValidationNotes, setFormValidationNotes] = useState("");

  // Dimensions (mm)
  const [dimWidthMm, setDimWidthMm] = useState(480);
  const [dimHeightMm, setDimHeightMm] = useState(880);
  const [dimDepthMm, setDimDepthMm] = useState(340);

  // Printable Surface (mm)
  const [surfaceWidthMm, setSurfaceWidthMm] = useState(380);
  const [surfaceHeightMm, setSurfaceHeightMm] = useState(620);
  const [safeTopMm, setSafeTopMm] = useState(15);
  const [safeBottomMm, setSafeBottomMm] = useState(25);
  const [safeLeftMm, setSafeLeftMm] = useState(15);
  const [safeRightMm, setSafeRightMm] = useState(15);
  const [bleedMm, setBleedMm] = useState(3);

  // Protected Branding
  const [brandingEnabled, setBrandingEnabled] = useState(true);
  const [brandingLocked, setBrandingLocked] = useState(true);
  const [brandingText, setBrandingText] = useState("CALVIN");
  const [brandingPos, setBrandingPos] = useState<"top_center" | "top_left" | "top_right">("top_center");
  const [brandingOffsetYMm, setBrandingOffsetYMm] = useState(35);
  const [brandingWidthMm, setBrandingWidthMm] = useState(120);
  const [brandingHeightMm, setBrandingHeightMm] = useState(30);

  // Model Readiness Manual Sign-off State
  const [checkMeasurementsVerified, setCheckMeasurementsVerified] = useState(false);
  const [checkUvMappingChecked, setCheckUvMappingChecked] = useState(false);
  const [checkFactoryValidationCompleted, setCheckFactoryValidationCompleted] = useState(false);

  // Compute live readiness evaluation
  const currentReadiness = useMemo(() => {
    return evaluateModelReadiness({
      glb_storage_path: formGlbPath,
      front_mesh_name: formFrontMeshName,
      dimensions_mm: {
        width: Number(dimWidthMm),
        height: Number(dimHeightMm),
        depth: Number(dimDepthMm),
      },
      surface: {
        physical_width_mm: Number(surfaceWidthMm),
        physical_height_mm: Number(surfaceHeightMm),
        safe_margin_top_mm: Number(safeTopMm),
        safe_margin_bottom_mm: Number(safeBottomMm),
        safe_margin_left_mm: Number(safeLeftMm),
        safe_margin_right_mm: Number(safeRightMm),
        bleed_margin_mm: Number(bleedMm),
        fixed_branding_overlay: {
          enabled: brandingEnabled,
          locked: brandingLocked,
          brand_text: brandingText,
          width_mm: Number(brandingWidthMm),
          height_mm: Number(brandingHeightMm),
        },
      },
      validation_notes: formValidationNotes,
      manual_checks: {
        measurements_verified: checkMeasurementsVerified,
        uv_mapping_checked: checkUvMappingChecked,
        factory_validation_completed: checkFactoryValidationCompleted,
      },
    });
  }, [
    formGlbPath,
    formFrontMeshName,
    dimWidthMm,
    dimHeightMm,
    dimDepthMm,
    surfaceWidthMm,
    surfaceHeightMm,
    safeTopMm,
    safeBottomMm,
    safeLeftMm,
    safeRightMm,
    bleedMm,
    brandingEnabled,
    brandingLocked,
    brandingText,
    brandingWidthMm,
    brandingHeightMm,
    formValidationNotes,
    checkMeasurementsVerified,
    checkUvMappingChecked,
    checkFactoryValidationCompleted,
  ]);

  const fetchCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch products for association
      const { data: prodsData, error: prodsErr } = await supabase
        .from("products")
        .select("id, name, slug")
        .order("name");

      if (prodsErr) throw prodsErr;
      setProducts(prodsData || []);

      // 2. Fetch models
      const { data: modelsData, error: modelsErr } = await supabase
        .from("product_3d_models")
        .select("*")
        .order("created_at", { ascending: false });

      if (modelsErr) {
        // Table might not exist yet if migration hasn't been applied to Supabase
        console.warn("Could not query product_3d_models (table may await migration execution):", modelsErr.message);
        setModels([]);
      } else {
        setModels(modelsData || []);

        // 3. Fetch surfaces for models
        const { data: surfacesData } = await supabase
          .from("product_printable_surfaces")
          .select("*");

        if (surfacesData) {
          const sMap: Record<string, ProductPrintableSurface> = {};
          for (const s of surfacesData) {
            sMap[s.model_id] = s;
          }
          setSurfaces(sMap);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load model registry.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  const openCreateModal = () => {
    setEditingModel(null);
    setFormModelCode(`CALVIN-DOMESTIC-0${models.length + 1}`);
    setFormName("CALVIN Domestic Flour Mill");
    setFormDescription("Flagstone domestic flour mill cabinet with front printable panel.");
    setFormProductId(products[0]?.id || "");
    setFormVersion(1);
    setFormStatus("draft");
    setFormIsActive(false);
    setFormGlbPath("");
    setFormFrontMeshName("Front_Print_Surface");
    setFormValidationNotes("");
    setCheckMeasurementsVerified(false);
    setCheckUvMappingChecked(false);
    setCheckFactoryValidationCompleted(false);
    setDimWidthMm(480);
    setDimHeightMm(880);
    setDimDepthMm(340);
    setSurfaceWidthMm(380);
    setSurfaceHeightMm(620);
    setSafeTopMm(15);
    setSafeBottomMm(25);
    setSafeLeftMm(15);
    setSafeRightMm(15);
    setBleedMm(3);
    setBrandingEnabled(true);
    setBrandingLocked(true);
    setBrandingText("CALVIN");
    setBrandingPos("top_center");
    setBrandingOffsetYMm(35);
    setBrandingWidthMm(120);
    setBrandingHeightMm(30);
    setIsModalOpen(true);
  };

  const openEditModal = (model: Product3DModel) => {
    setEditingModel(model);
    setFormModelCode(model.model_code);
    setFormName(model.name);
    setFormDescription(model.description || "");
    setFormProductId(model.product_id || "");
    setFormVersion(model.version);
    setFormStatus(model.status);
    setFormIsActive(model.is_active);
    setFormGlbPath(model.glb_storage_path || "");
    setFormFrontMeshName(model.front_mesh_name || "Front_Print_Surface");
    
    // Extract notes and manual readiness flags
    const cleanNotes = (model.validation_notes || "").replace(/\[CHECKLIST:\s*\{.*?\}\s*\]/g, "").trim();
    setFormValidationNotes(cleanNotes);
    const flags = parseChecklistFromNotes(model.validation_notes);
    setCheckMeasurementsVerified(Boolean(flags.measurements_verified));
    setCheckUvMappingChecked(Boolean(flags.uv_mapping_checked));
    setCheckFactoryValidationCompleted(Boolean(flags.factory_validation_completed));

    setDimWidthMm(model.dimensions_mm.width || 480);
    setDimHeightMm(model.dimensions_mm.height || 880);
    setDimDepthMm(model.dimensions_mm.depth || 340);

    const s = surfaces[model.id];
    if (s) {
      setSurfaceWidthMm(s.physical_width_mm || 380);
      setSurfaceHeightMm(s.physical_height_mm || 620);
      setSafeTopMm(s.safe_margins_mm?.top || 15);
      setSafeBottomMm(s.safe_margins_mm?.bottom || 25);
      setSafeLeftMm(s.safe_margins_mm?.left || 15);
      setSafeRightMm(s.safe_margins_mm?.right || 15);
      setBleedMm(s.safe_margins_mm?.bleed || 3);
      setBrandingEnabled(s.fixed_branding?.enabled ?? true);
      setBrandingLocked(s.fixed_branding?.locked ?? true);
      setBrandingText(s.fixed_branding?.brand_text || "CALVIN");
      setBrandingPos((s.fixed_branding?.position as "top_center" | "top_left" | "top_right") || "top_center");
      setBrandingOffsetYMm(s.fixed_branding?.offset_y_mm ?? 35);
      setBrandingWidthMm(s.fixed_branding?.width_mm ?? 120);
      setBrandingHeightMm(s.fixed_branding?.height_mm ?? 30);
    }
    setIsModalOpen(true);
  };

  const handleGlbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".glb")) {
      setError("Only binary glTF (.glb) files are accepted.");
      return;
    }

    setUploadingGlb(true);
    setError(null);
    try {
      const cleanName = `${formModelCode.toLowerCase()}-v${formVersion}-${Date.now()}.glb`;
      const filePath = `models/${cleanName}`;

      const { error: uploadErr } = await supabase.storage
        .from("product-3d-models")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      setFormGlbPath(filePath);
      setSuccessMsg(`GLB uploaded successfully: ${filePath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload GLB.";
      setError(msg);
    } finally {
      setUploadingGlb(false);
    }
  };

  const handleSaveModel = async () => {
    if (!formModelCode.trim() || !formName.trim()) {
      setError("Model code and model name are required.");
      return;
    }

    // Strict Gate: Production publishing requires all 7 checklist criteria to pass
    if (formStatus === "published" && !currentReadiness.isReadyForPublishing) {
      setError(
        `Cannot publish model to production storefront. The following required readiness criteria must be satisfied: ${currentReadiness.missingItems.map((i) => i.label).join(", ")}`
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const encodedNotes = encodeChecklistInNotes(formValidationNotes.trim(), {
        measurements_verified: checkMeasurementsVerified,
        uv_mapping_checked: checkUvMappingChecked,
        factory_validation_completed: checkFactoryValidationCompleted,
      });

      const modelPayload = {
        model_code: formModelCode.trim(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        product_id: formProductId || null,
        version: formVersion,
        status: formStatus,
        is_active: formIsActive,
        glb_storage_path: formGlbPath.trim() || null,
        front_mesh_name: formFrontMeshName.trim() || "Front_Print_Surface",
        dimensions_mm: {
          width: Number(dimWidthMm),
          height: Number(dimHeightMm),
          depth: Number(dimDepthMm),
        },
        validation_notes: encodedNotes || null,
        validated_at: formStatus === "validated" || formStatus === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      let savedModelId = editingModel?.id;

      if (editingModel) {
        const { error: updateErr } = await supabase
          .from("product_3d_models")
          .update(modelPayload)
          .eq("id", editingModel.id);
        if (updateErr) throw updateErr;
      } else {
        const { data: insertData, error: insertErr } = await supabase
          .from("product_3d_models")
          .insert([modelPayload])
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        savedModelId = insertData.id;
      }

      if (savedModelId) {
        // Upsert surface calibration
        const surfacePayload = {
          model_id: savedModelId,
          surface_key: "front_door_panel",
          surface_name: "Front Door Panel",
          mesh_target_name: formFrontMeshName.trim() || "Front_Print_Surface",
          material_slot_name: "mat_front_print",
          physical_width_mm: Number(surfaceWidthMm),
          physical_height_mm: Number(surfaceHeightMm),
          safe_margin_top_mm: Number(safeTopMm),
          safe_margin_bottom_mm: Number(safeBottomMm),
          safe_margin_left_mm: Number(safeLeftMm),
          safe_margin_right_mm: Number(safeRightMm),
          bleed_margin_mm: Number(bleedMm),
          fixed_branding_overlay: {
            enabled: brandingEnabled,
            locked: brandingLocked,
            brand_text: brandingText,
            position: brandingPos,
            offset_x_mm: 0,
            offset_y_mm: Number(brandingOffsetYMm),
            width_mm: Number(brandingWidthMm),
            height_mm: Number(brandingHeightMm),
          },
          status: formStatus === "published" ? "published" : "calibrated",
          updated_at: new Date().toISOString(),
        };

        const { error: surfErr } = await supabase
          .from("product_printable_surfaces")
          .upsert([surfacePayload], { onConflict: "model_id,surface_key" });

        if (surfErr) {
          console.warn("Surface upsert warning:", surfErr.message);
        }
      }

      setSuccessMsg(`Model "${formName}" saved successfully.`);
      setIsModalOpen(false);
      fetchCatalogue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save model profile.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewVersion = (model: Product3DModel) => {
    setEditingModel(null);
    setFormModelCode(model.model_code);
    setFormName(`${model.name} (Rev ${model.version + 1})`);
    setFormDescription(model.description || "");
    setFormProductId(model.product_id || "");
    setFormVersion(model.version + 1);
    setFormStatus("draft");
    setFormIsActive(false);
    setFormGlbPath("");
    setFormFrontMeshName(model.front_mesh_name || "Front_Print_Surface");
    setFormValidationNotes(`Forked from version ${model.version}. Physical measurement verification required.`);
    setCheckMeasurementsVerified(false);
    setCheckUvMappingChecked(false);
    setCheckFactoryValidationCompleted(false);
    setDimWidthMm(model.dimensions_mm.width || 480);
    setDimHeightMm(model.dimensions_mm.height || 880);
    setDimDepthMm(model.dimensions_mm.depth || 340);
    setIsModalOpen(true);
  };

  const openIntakeModal = (model?: Product3DModel) => {
    if (model) {
      setTargetIntakeModel(model);
      const s = surfaces[model.id];
      let existingManifest: ModelAssetIntakeManifest | null = null;
      if (model.validation_notes) {
        const match = model.validation_notes.match(/\[INTAKE_MANIFEST:\s*(\{.*?\})\s*\]/);
        if (match && match[1]) {
          existingManifest = parseIntakeManifest(match[1]);
        }
      }
      if (!existingManifest) {
        const initial = createInitialCompactIntakeManifest(model.model_code, model.name);
        if (model.dimensions_mm?.width) initial.cabinet_measurements.width_mm.value_mm = model.dimensions_mm.width;
        if (model.dimensions_mm?.height) initial.cabinet_measurements.height_mm.value_mm = model.dimensions_mm.height;
        if (model.dimensions_mm?.depth) initial.cabinet_measurements.depth_mm.value_mm = model.dimensions_mm.depth;
        if (s?.physical_width_mm) initial.panel_measurements.width_mm.value_mm = s.physical_width_mm;
        if (s?.physical_height_mm) initial.panel_measurements.height_mm.value_mm = s.physical_height_mm;
        existingManifest = initial;
      }
      setCurrentIntakeManifest(existingManifest);
    } else {
      setTargetIntakeModel(null);
      setCurrentIntakeManifest(createInitialCompactIntakeManifest());
    }
    setIsIntakeModalOpen(true);
  };

  const handleSaveIntakeManifest = async (updated: ModelAssetIntakeManifest) => {
    if (targetIntakeModel) {
      const cab = updated.cabinet_measurements;
      const pan = updated.panel_measurements;

      // Encode intake manifest tag in validation_notes
      const currentNotes = targetIntakeModel.validation_notes || "";
      const cleanNotes = currentNotes.replace(/\[INTAKE_MANIFEST:\s*\{.*?\}\s*\]/g, "").trim();
      const manifestTag = `[INTAKE_MANIFEST: ${JSON.stringify(updated)}]`;
      const newNotes = cleanNotes ? `${cleanNotes}\n\n${manifestTag}` : manifestTag;

      const { error: modelErr } = await supabase
        .from("product_3d_models")
        .update({
          dimensions_mm: {
            width: cab.width_mm.value_mm,
            height: cab.height_mm.value_mm,
            depth: cab.depth_mm.value_mm,
          },
          validation_notes: newNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetIntakeModel.id);

      if (modelErr) throw modelErr;

      // Update surface dimensions and cutout zones
      const { error: surfErr } = await supabase
        .from("product_printable_surfaces")
        .update({
          physical_width_mm: pan.width_mm.value_mm,
          physical_height_mm: pan.height_mm.value_mm,
          safe_margin_top_mm: pan.safe_margin_top_mm.value_mm,
          safe_margin_bottom_mm: pan.safe_margin_bottom_mm.value_mm,
          safe_margin_left_mm: pan.safe_margin_left_mm.value_mm,
          safe_margin_right_mm: pan.safe_margin_right_mm.value_mm,
          bleed_margin_mm: pan.nominal_bleed_mm.value_mm,
          cutout_zones: updated.obstacles,
          updated_at: new Date().toISOString(),
        })
        .eq("model_id", targetIntakeModel.id);

      if (surfErr) {
        console.warn("Could not update surface cutout zones:", surfErr.message);
      }

      setSuccessMsg(`Asset intake manifest saved for ${updated.model_code}.`);
      fetchCatalogue();
    } else {
      setSuccessMsg(`Asset intake manifest configured for ${updated.model_code}.`);
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        title="3D Models & Printable Surfaces"
        subtitle="Manage machine model profiles, physical millimeter dimensions, front-panel mesh UVs, and locked CALVIN branding."
        breadcrumbs={[{ label: "Catalogue" }, { label: "3D Models" }]}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCatalogue}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => openIntakeModal()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-xs hover:bg-amber-100"
            >
              <Camera size={14} className="text-amber-700" />
              Asset Intake Studio
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700"
            >
              <Plus size={15} />
              Add Machine Model
            </button>
          </div>
        }
      />

      {/* Safety Notice Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-700" size={18} />
          <div className="space-y-1 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold uppercase tracking-wider text-amber-950">
              Manufacturing-Grade Verification Standard
            </p>
            <p>
              Models remain in <span className="font-semibold underline">Draft</span> or{" "}
              <span className="font-semibold underline">Unvalidated</span> status until physical engineering
              measurements (vernier caliper/tape) and non-distorted planar UV unwrapping are verified against the factory machine door.
              Only <span className="font-semibold underline">Published</span> models are surfaced to customers in the live 3D personalization studio.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Models Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => {
          const s = surfaces[model.id];
          const prod = products.find((p) => p.id === model.product_id);

          return (
            <div
              key={model.id}
              className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-all hover:border-stone-300"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="inline-block rounded-md bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-stone-600">
                      {model.model_code} • v{model.version}
                    </span>
                    <h3 className="font-bold text-stone-900">{model.name}</h3>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      model.status === "published"
                        ? "bg-emerald-100 text-emerald-800"
                        : model.status === "validated"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {model.status}
                  </span>
                </div>

                <p className="text-xs text-stone-500 line-clamp-2">
                  {model.description || "No description provided."}
                </p>

                {/* Specs Pill Matrix */}
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-600">
                  <div>
                    <span className="block text-[10px] text-stone-400">Cabinet Size</span>
                    <span className="font-semibold text-stone-800">
                      {model.dimensions_mm.width}×{model.dimensions_mm.height}×{model.dimensions_mm.depth} mm
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-400">Print Surface</span>
                    <span className="font-semibold text-stone-800">
                      {s ? `${s.physical_width_mm}×${s.physical_height_mm} mm` : "Pending Calib"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-400">Front Mesh</span>
                    <span className="font-mono font-semibold text-stone-800 truncate block">
                      {model.front_mesh_name}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-stone-400">Branding Lock</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                      <Lock size={10} className="text-amber-600" />
                      {s?.fixed_branding?.brand_text || "CALVIN"}
                    </span>
                  </div>
                </div>

                {/* Model Readiness Indicator */}
                {(() => {
                  const cardReadiness = evaluateModelReadiness({
                    glb_storage_path: model.glb_storage_path,
                    front_mesh_name: model.front_mesh_name,
                    dimensions_mm: model.dimensions_mm,
                    surface: s
                      ? {
                          physical_width_mm: s.physical_width_mm,
                          physical_height_mm: s.physical_height_mm,
                          safe_margin_top_mm: s.safe_margins_mm?.top,
                          safe_margin_bottom_mm: s.safe_margins_mm?.bottom,
                          safe_margin_left_mm: s.safe_margins_mm?.left,
                          safe_margin_right_mm: s.safe_margins_mm?.right,
                          bleed_margin_mm: s.safe_margins_mm?.bleed,
                          fixed_branding_overlay: s.fixed_branding,
                        }
                      : null,
                    validation_notes: model.validation_notes,
                  });

                  return (
                    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50/70 px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium text-stone-500">Readiness Gate:</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          cardReadiness.isReadyForPublishing ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {cardReadiness.isReadyForPublishing ? (
                          <>
                            <ShieldCheck size={12} className="text-emerald-600" />
                            7/7 Criteria Met
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={12} className="text-amber-600" />
                            {cardReadiness.completedCount}/7 Verified (Draft)
                          </>
                        )}
                      </span>
                    </div>
                  );
                })()}

                {prod && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                    <span className="text-stone-400">Linked:</span>
                    <Link
                      href={`/products/${prod.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 font-medium text-amber-800 hover:underline"
                    >
                      {prod.name}
                      <ExternalLink size={10} />
                    </Link>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-3">
                <button
                  onClick={() => handleCreateNewVersion(model)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
                  title="Create v+1 revision"
                >
                  <Copy size={13} />
                  New Version
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openIntakeModal(model)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                    title="Upload reference photographs & caliper measurements"
                  >
                    <Camera size={13} />
                    Asset Intake
                  </button>

                  <button
                    onClick={() => openEditModal(model)}
                    className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
                  >
                    Edit & Calibrate
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {models.length === 0 && !loading && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-stone-200 bg-white p-12 text-center">
            <Box size={40} className="mx-auto text-stone-300" />
            <h3 className="mt-3 text-sm font-bold text-stone-800">No Machine Models Registered Yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-stone-500">
              Create your first physical machine model profile to begin configuring front-panel surfaces and branding zones.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Plus size={14} />
              Register First Model
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit / Calibrate Modal */}
      <AdminDialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="2xl"
        title={editingModel ? `Edit Model: ${editingModel.model_code}` : "Register New Machine Model"}
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
          {/* Section 1: Basic Profile */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              1. Profile & Versioning
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Model Code</label>
                <input
                  type="text"
                  value={formModelCode}
                  onChange={(e) => setFormModelCode(e.target.value)}
                  placeholder="e.g. CALVIN-CLASSIC-01"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Display Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. CALVIN Classic Domestic Mill"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700">Associated Product</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs"
                >
                  <option value="">-- None / Standalone Machine Profile --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Version</label>
                <input
                  type="number"
                  min={1}
                  value={formVersion}
                  onChange={(e) => setFormVersion(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ModelLifecycleStatus)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold"
                >
                  <option value="draft">Draft (In Development)</option>
                  <option value="validated">Validated (Calibrated by Staff)</option>
                  <option value="published" disabled={!currentReadiness.isReadyForPublishing}>
                    Published {currentReadiness.isReadyForPublishing ? "(Live on Storefront)" : `(Locked: ${currentReadiness.completedCount}/7 criteria)`}
                  </option>
                  <option value="archived">Archived</option>
                </select>
                {!currentReadiness.isReadyForPublishing && (
                  <span className="mt-1 block text-[10px] text-amber-700">
                    Publishing disabled until all 7 readiness criteria pass.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Physical Machine Dimensions */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              2. Physical Outer Dimensions (Millimeters)
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Width (mm)</label>
                <input
                  type="number"
                  value={dimWidthMm}
                  onChange={(e) => setDimWidthMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Height (mm)</label>
                <input
                  type="number"
                  value={dimHeightMm}
                  onChange={(e) => setDimHeightMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">Depth (mm)</label>
                <input
                  type="number"
                  value={dimDepthMm}
                  onChange={(e) => setDimDepthMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: 3D Asset & Mesh Target */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              3. 3D GLTF/GLB Asset & Mesh Binding
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Target Front Mesh Node Name
                </label>
                <input
                  type="text"
                  value={formFrontMeshName}
                  onChange={(e) => setFormFrontMeshName(e.target.value)}
                  placeholder="e.g. Front_Print_Surface"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-mono"
                />
                <span className="text-[10px] text-stone-500">
                  Must match the exact node in the GLB hierarchy.
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">GLB Binary Upload</label>
                <input
                  type="file"
                  accept=".glb"
                  onChange={handleGlbUpload}
                  disabled={uploadingGlb}
                  className="mt-1 w-full text-xs text-stone-500 file:mr-2 file:rounded-md file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs file:font-semibold"
                />
                {formGlbPath && (
                  <span className="mt-1 block font-mono text-[10px] text-emerald-700 truncate">
                    Saved: {formGlbPath}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Printable Surface & Safe Boundaries */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              4. Front Printable Panel & Margins (mm)
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Print Width (mm)</label>
                <input
                  type="number"
                  value={surfaceWidthMm}
                  onChange={(e) => setSurfaceWidthMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Print Height (mm)</label>
                <input
                  type="number"
                  value={surfaceHeightMm}
                  onChange={(e) => setSurfaceHeightMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Safe Top (mm)</label>
                <input
                  type="number"
                  value={safeTopMm}
                  onChange={(e) => setSafeTopMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Safe Bottom (mm)</label>
                <input
                  type="number"
                  value={safeBottomMm}
                  onChange={(e) => setSafeBottomMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Protected CALVIN Branding Overlay */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                5. Protected CALVIN Branding Lock
              </h4>
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <Lock size={10} /> Locked Coordinate Region
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Brand Text</label>
                <input
                  type="text"
                  value={brandingText}
                  onChange={(e) => setBrandingText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Position Anchor</label>
                <select
                  value={brandingPos}
                  onChange={(e) => setBrandingPos(e.target.value as "top_center" | "top_left" | "top_right")}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
                >
                  <option value="top_center">Top Center</option>
                  <option value="top_left">Top Left</option>
                  <option value="top_right">Top Right</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Top Offset (mm)</label>
                <input
                  type="number"
                  value={brandingOffsetYMm}
                  onChange={(e) => setBrandingOffsetYMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700">Width (mm)</label>
                <input
                  type="number"
                  value={brandingWidthMm}
                  onChange={(e) => setBrandingWidthMm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Real-time 2D Visual Calibration Preview */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              Live Calibration Diagram (Proportional 2D Representation)
            </span>
            <div className="flex justify-center">
              <div
                className="relative rounded-lg border-2 border-dashed border-stone-400 bg-white shadow-inner flex flex-col items-center justify-between p-3"
                style={{
                  width: "160px",
                  height: `${Math.round((surfaceHeightMm / (surfaceWidthMm || 1)) * 160)}px`,
                  maxHeight: "260px",
                }}
              >
                {/* Protected Brand Pill */}
                <div
                  className="w-4/5 rounded bg-amber-500/20 border border-amber-600/60 py-1 text-center font-bold tracking-widest text-[9px] text-amber-900 select-none flex items-center justify-center gap-1"
                  style={{ marginTop: `${Math.max(4, Math.round((brandingOffsetYMm / surfaceHeightMm) * 100))}%` }}
                >
                  <Lock size={8} /> {brandingText}
                </div>

                {/* Safe Margins Guide */}
                <div className="text-center font-mono text-[9px] text-stone-400">
                  Safe Customer Area
                  <span className="block text-[8px] text-stone-300">
                    {surfaceWidthMm} × {surfaceHeightMm} mm
                  </span>
                </div>

                {/* Lower Chute clearance line */}
                <div className="w-full border-t border-dotted border-stone-300 text-center text-[8px] text-stone-400 pb-0.5">
                  Dispensing Chute Clearance
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Model-Readiness & Factory Verification Checklist */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
                <ShieldCheck size={15} className="text-amber-600" />
                6. Model-Readiness Checklist ({currentReadiness.completedCount}/7 Required to Publish)
              </h4>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                  currentReadiness.isReadyForPublishing
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {currentReadiness.isReadyForPublishing ? "Ready to Publish" : "Publishing Locked"}
              </span>
            </div>

            <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-stone-50/50">
              {/* 1. GLB Uploaded */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.glb_uploaded ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-stone-900">1. GLB Binary Uploaded</span>
                    <span className="block text-[11px] text-stone-500">
                      {formGlbPath ? formGlbPath : "No GLB file uploaded yet. Upload in Section 3."}
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.glb_uploaded
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.glb_uploaded ? "Uploaded" : "Pending"}
                </span>
              </div>

              {/* 2. Physical Measurements Verified */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.measurements_verified ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkMeasurementsVerified}
                        onChange={(e) => setCheckMeasurementsVerified(e.target.checked)}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-900">
                        2. Physical Measurements Verified
                      </span>
                    </label>
                    <span className="ml-5 block text-[11px] text-stone-500">
                      Cabinet ({dimWidthMm}×{dimHeightMm}×{dimDepthMm} mm) verified against physical machine with caliper/tape.
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.measurements_verified
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.measurements_verified ? "Verified" : "Unverified"}
                </span>
              </div>

              {/* 3. Front Mesh Identified */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.front_mesh_identified ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-stone-900">
                      3. Front Mesh Node Identified
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      Target mesh: <code className="font-mono text-stone-800">{formFrontMeshName || "None"}</code>
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.front_mesh_identified
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.front_mesh_identified ? "Identified" : "Missing"}
                </span>
              </div>

              {/* 4. UV Mapping Checked */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.uv_mapping_checked ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkUvMappingChecked}
                        onChange={(e) => setCheckUvMappingChecked(e.target.checked)}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-900">
                        4. UV Mapping Checked & Planar
                      </span>
                    </label>
                    <span className="ml-5 block text-[11px] text-stone-500">
                      Front door UV projection verified: zero non-uniform stretch, matches aspect ratio.
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.uv_mapping_checked
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.uv_mapping_checked ? "Checked" : "Pending"}
                </span>
              </div>

              {/* 5. Printable Boundaries Verified */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.printable_boundaries_verified ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-stone-900">
                      5. Printable Boundaries & Margins Verified
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      Print area ({surfaceWidthMm}×{surfaceHeightMm} mm) with Top:{safeTopMm}mm Bottom:{safeBottomMm}mm margins.
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.printable_boundaries_verified
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.printable_boundaries_verified ? "Calibrated" : "Invalid"}
                </span>
              </div>

              {/* 6. Calvin Branding Position Approved */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.calvin_branding_approved ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-stone-900">
                      6. CALVIN Branding Position Approved
                    </span>
                    <span className="block text-[11px] text-stone-500">
                      Locked brand mark &ldquo;{brandingText}&rdquo; at {brandingPos} ({brandingWidthMm}×{brandingHeightMm} mm, Offset Y: {brandingOffsetYMm}mm).
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.calvin_branding_approved
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.calvin_branding_approved ? "Approved" : "Unapproved"}
                </span>
              </div>

              {/* 7. Factory Validation Completed */}
              <div className="flex items-start justify-between p-3">
                <div className="flex items-start gap-2.5">
                  {currentReadiness.checklist.factory_validation_completed ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkFactoryValidationCompleted}
                        onChange={(e) => setCheckFactoryValidationCompleted(e.target.checked)}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-stone-900">
                        7. Factory Engineering Validation Sign-off
                      </span>
                    </label>
                    <span className="ml-5 block text-[11px] text-stone-500">
                      Engineering certification sign-off entered in validation notes below.
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    currentReadiness.checklist.factory_validation_completed
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {currentReadiness.checklist.factory_validation_completed ? "Signed Off" : "Pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Validation Notes */}
          <div>
            <label className="block text-xs font-semibold text-stone-700">
              Physical Measurement & Engineering Notes
            </label>
            <textarea
              rows={2}
              value={formValidationNotes}
              onChange={(e) => setFormValidationNotes(e.target.value)}
              placeholder="e.g. Verified with manual caliper on 2026-11-03. Front door panel bevel is 8mm."
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone-100 pt-4">
          <button
            onClick={() => setIsModalOpen(false)}
            className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveModel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Model Profile"}
          </button>
        </div>
      </AdminDialog>

      {/* Asset Intake & Reference Photos Dialog */}
      <AssetIntakeDialog
        isOpen={isIntakeModalOpen}
        onClose={() => setIsIntakeModalOpen(false)}
        manifest={currentIntakeManifest}
        onSaveManifest={handleSaveIntakeManifest}
      />
    </div>
  );
}
