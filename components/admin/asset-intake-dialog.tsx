"use client";

import { useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileCode,
  Lock,
  Plus,
  Ruler,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { supabase } from "@/lib/supabase/client";
import {
  type ModelAssetIntakeManifest,
  type ReferencePhoto,
  type ReferencePhotoAngle,
  PHOTO_ANGLE_DEFINITIONS,
  type MeasurementField,
  type NonPrintableObstacle,
} from "@/types/asset-intake";
import { generateBlenderSpecificationMarkdown } from "@/lib/3d/asset-intake";

interface AssetIntakeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: ModelAssetIntakeManifest;
  onSaveManifest: (updated: ModelAssetIntakeManifest) => Promise<void>;
}

export function AssetIntakeDialog({
  isOpen,
  onClose,
  manifest: initialManifest,
  onSaveManifest,
}: AssetIntakeDialogProps) {
  const [manifest, setManifest] = useState<ModelAssetIntakeManifest>(initialManifest);
  const [activeTab, setActiveTab] = useState<"photos" | "measurements" | "obstacles" | "blender">("photos");
  const [uploadingAngle, setUploadingAngle] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedSpec, setCopiedSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper for updating a measurement field
  const updateMeasurement = (
    section: "cabinet" | "panel",
    field: string,
    key: keyof MeasurementField,
    value: string | number | boolean
  ) => {
    setManifest((prev) => {
      if (section === "cabinet") {
        const currentField = prev.cabinet_measurements[field as keyof typeof prev.cabinet_measurements];
        return {
          ...prev,
          cabinet_measurements: {
            ...prev.cabinet_measurements,
            [field]: {
              ...currentField,
              [key]: value,
            },
          },
        };
      } else {
        const currentField = prev.panel_measurements[field as keyof typeof prev.panel_measurements];
        return {
          ...prev,
          panel_measurements: {
            ...prev.panel_measurements,
            [field]: {
              ...currentField,
              [key]: value,
            },
          },
        };
      }
    });
  };

  // Upload full-resolution reference photo without downscaling
  const handlePhotoUpload = async (angle: ReferencePhotoAngle, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAngle(angle);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const cleanFileName = `${manifest.model_code.toLowerCase()}-${angle}-${Date.now()}.${ext}`;
      const storagePath = `model-intake/${manifest.model_code.toLowerCase()}/${cleanFileName}`;

      // Upload lossless original stream directly to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("product-media")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadErr) throw uploadErr;

      const { data: pubData } = supabase.storage.from("product-media").getPublicUrl(storagePath);

      const newPhoto: ReferencePhoto = {
        id: `photo_${Date.now()}`,
        angle,
        label: PHOTO_ANGLE_DEFINITIONS[angle].label,
        storage_path: storagePath,
        public_url: pubData.publicUrl,
        original_filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_at: new Date().toISOString(),
      };

      setManifest((prev) => {
        // Replace existing photo for this angle or append
        const filtered = prev.reference_photos.filter((p) => p.angle !== angle);
        return {
          ...prev,
          reference_photos: [...filtered, newPhoto],
          intake_status: "photos_in_progress",
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload photo.";
      setError(msg);
    } finally {
      setUploadingAngle(null);
    }
  };

  // Upload official brand logo vector/raster
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "svg";
      const storagePath = `model-intake/${manifest.model_code.toLowerCase()}/calvin-logo-official-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("product-media")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadErr) throw uploadErr;

      const { data: pubData } = supabase.storage.from("product-media").getPublicUrl(storagePath);

      setManifest((prev) => ({
        ...prev,
        brand_logo: {
          storage_path: storagePath,
          public_url: pubData.publicUrl,
          original_filename: file.name,
          file_format: ext === "svg" ? "svg" : "png",
          width_mm: 120,
          height_mm: 30,
          position_anchor: "top_center",
          offset_y_mm: 35,
          is_brand_approved: true,
          approval_date: new Date().toISOString().split("T")[0],
        },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload logo.";
      setError(msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCopySpec = () => {
    const specMd = generateBlenderSpecificationMarkdown(manifest);
    navigator.clipboard.writeText(specMd);
    setCopiedSpec(true);
    setTimeout(() => setCopiedSpec(false), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSaveManifest(manifest);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save asset intake.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const uploadedAnglesCount = new Set(manifest.reference_photos.map((p) => p.angle)).size;
  const totalAngles = Object.keys(PHOTO_ANGLE_DEFINITIONS).length;

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={`Machine Asset Intake: ${manifest.model_name} (${manifest.model_code})`}
    >
      <div className="space-y-5 max-h-[75vh] overflow-y-auto px-1">
        {/* Banner with Intake Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={16} className="text-amber-700 shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider">No CAD / 3D Model On Record</span>
              <p className="text-[11px] text-amber-800">
                Collect high-resolution photographs &amp; millimeter caliper measurements to guide Blender modeling.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-amber-900">
            {manifest.intake_status.replace("_", " ")}
          </span>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("photos")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === "photos"
                ? "border-amber-600 text-amber-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Camera size={14} />
            1. Reference Photos ({uploadedAnglesCount}/{totalAngles})
          </button>
          <button
            onClick={() => setActiveTab("measurements")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === "measurements"
                ? "border-amber-600 text-amber-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Ruler size={14} />
            2. Millimeter Measurements
          </button>
          <button
            onClick={() => setActiveTab("obstacles")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === "obstacles"
                ? "border-amber-600 text-amber-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <Lock size={14} />
            3. Obstacles &amp; Logo
          </button>
          <button
            onClick={() => setActiveTab("blender")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === "blender"
                ? "border-amber-600 text-amber-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <FileCode size={14} />
            4. Blender Handover Spec
          </button>
        </div>

        {/* TAB 1: REFERENCE PHOTOS */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            <p className="text-xs text-stone-600">
              Upload original photographs without compression or resolution downscaling. These images serve as the orthographic modeling planes and surface texture references in Blender.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(PHOTO_ANGLE_DEFINITIONS) as ReferencePhotoAngle[]).map((angle) => {
                const def = PHOTO_ANGLE_DEFINITIONS[angle];
                const existing = manifest.reference_photos.find((p) => p.angle === angle);
                const isUploading = uploadingAngle === angle;

                return (
                  <div
                    key={angle}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 text-xs transition-all hover:bg-stone-50"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-stone-900">{def.label}</span>
                        {existing ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 size={10} /> Uploaded
                          </span>
                        ) : def.required ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Required
                          </span>
                        ) : (
                          <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600">
                            Optional
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed">{def.description}</p>
                    </div>

                    <div className="mt-3 border-t border-stone-200/60 pt-2.5">
                      {existing ? (
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={existing.public_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate text-[11px] font-medium text-amber-800 hover:underline"
                          >
                            <ExternalLink size={10} />
                            {existing.original_filename} ({(existing.file_size_bytes / (1024 * 1024)).toFixed(2)} MB)
                          </a>
                          <label className="cursor-pointer text-[11px] font-semibold text-stone-600 hover:text-stone-900">
                            Replace
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => handlePhotoUpload(angle, e)}
                              disabled={isUploading}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 bg-white py-2 text-[11px] font-semibold text-stone-700 hover:border-amber-500 hover:bg-amber-50/30">
                          <Upload size={12} className={isUploading ? "animate-bounce" : ""} />
                          {isUploading ? "Uploading Lossless File..." : "Upload Original Photo"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handlePhotoUpload(angle, e)}
                            disabled={isUploading}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: MILLIMETER MEASUREMENTS */}
        {activeTab === "measurements" && (
          <div className="space-y-5">
            {/* Cabinet Outer Dimensions */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Cabinet Outer Dimensions (Millimeters)
              </h4>
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase text-stone-600">
                    <tr>
                      <th className="p-3">Dimension</th>
                      <th className="p-3">Value (mm)</th>
                      <th className="p-3">Verification Status</th>
                      <th className="p-3">Tool / Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[
                      { key: "width_mm", label: "Cabinet Outer Width" },
                      { key: "height_mm", label: "Cabinet Outer Height (w/ feet)" },
                      { key: "depth_mm", label: "Cabinet Outer Depth" },
                    ].map(({ key, label }) => {
                      const f = manifest.cabinet_measurements[key as keyof typeof manifest.cabinet_measurements];
                      return (
                        <tr key={key}>
                          <td className="p-3 font-semibold text-stone-800">{label}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              value={f.value_mm}
                              onChange={(e) =>
                                updateMeasurement("cabinet", key, "value_mm", Number(e.target.value))
                              }
                              className="w-24 rounded border border-stone-200 px-2 py-1 font-mono text-xs font-bold"
                            />
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateMeasurement(
                                  "cabinet",
                                  key,
                                  "status",
                                  f.status === "factory_confirmed" ? "unverified" : "factory_confirmed"
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                                f.status === "factory_confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {f.status === "factory_confirmed" ? (
                                <>
                                  <Check size={10} /> Factory Confirmed
                                </>
                              ) : (
                                <>
                                  <Clock size={10} /> Unverified Estimate
                                </>
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              placeholder="e.g. 300mm Vernier Caliper / Tape"
                              value={f.measurement_tool || ""}
                              onChange={(e) => updateMeasurement("cabinet", key, "measurement_tool", e.target.value)}
                              className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Front Door Panel Dimensions */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Front Printable Panel Dimensions &amp; Margins
              </h4>
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase text-stone-600">
                    <tr>
                      <th className="p-3">Panel Parameter</th>
                      <th className="p-3">Value (mm)</th>
                      <th className="p-3">Verification Status</th>
                      <th className="p-3">Measured By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[
                      { key: "width_mm", label: "Door Width" },
                      { key: "height_mm", label: "Door Height" },
                      { key: "thickness_mm", label: "Door Bevel Thickness" },
                      { key: "corner_radius_mm", label: "Corner Radius / Chamfer" },
                      { key: "safe_margin_top_mm", label: "Safe Margin (Top)" },
                      { key: "safe_margin_bottom_mm", label: "Safe Margin (Bottom / Chute)" },
                      { key: "safe_margin_left_mm", label: "Safe Margin (Left / Hinge)" },
                      { key: "safe_margin_right_mm", label: "Safe Margin (Right / Latch)" },
                      { key: "nominal_bleed_mm", label: "Nominal Bleed Allowance" },
                    ].map(({ key, label }) => {
                      const f = manifest.panel_measurements[key as keyof typeof manifest.panel_measurements];
                      return (
                        <tr key={key}>
                          <td className="p-3 font-semibold text-stone-800">{label}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              value={f.value_mm}
                              onChange={(e) =>
                                updateMeasurement("panel", key, "value_mm", Number(e.target.value))
                              }
                              className="w-24 rounded border border-stone-200 px-2 py-1 font-mono text-xs font-bold"
                            />
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateMeasurement(
                                  "panel",
                                  key,
                                  "status",
                                  f.status === "factory_confirmed" ? "unverified" : "factory_confirmed"
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                                f.status === "factory_confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {f.status === "factory_confirmed" ? (
                                <>
                                  <Check size={10} /> Confirmed
                                </>
                              ) : (
                                <>
                                  <Clock size={10} /> Unverified
                                </>
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              placeholder="e.g. Ramesh Patel (QA Lead)"
                              value={f.measured_by || ""}
                              onChange={(e) => updateMeasurement("panel", key, "measured_by", e.target.value)}
                              className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OBSTACLES & LOGO */}
        {activeTab === "obstacles" && (
          <div className="space-y-5">
            {/* Official Logo Section */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Official CALVIN Corporate Brand Vector
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    High-resolution SVG or lossless transparent PNG stored separately from customer canvas.
                  </p>
                </div>
                {manifest.brand_logo?.is_brand_approved && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Brand Approved
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <div>
                  <label className="block text-[10px] font-semibold text-stone-600">Logo Width (mm)</label>
                  <input
                    type="number"
                    value={manifest.brand_logo?.width_mm || 120}
                    onChange={(e) =>
                      setManifest((prev) => ({
                        ...prev,
                        brand_logo: prev.brand_logo
                          ? { ...prev.brand_logo, width_mm: Number(e.target.value) }
                          : undefined,
                      }))
                    }
                    className="w-24 rounded border border-stone-200 px-2 py-1 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-stone-600">Logo Height (mm)</label>
                  <input
                    type="number"
                    value={manifest.brand_logo?.height_mm || 30}
                    onChange={(e) =>
                      setManifest((prev) => ({
                        ...prev,
                        brand_logo: prev.brand_logo
                          ? { ...prev.brand_logo, height_mm: Number(e.target.value) }
                          : undefined,
                      }))
                    }
                    className="w-24 rounded border border-stone-200 px-2 py-1 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-stone-600">Top Offset (mm)</label>
                  <input
                    type="number"
                    value={manifest.brand_logo?.offset_y_mm || 35}
                    onChange={(e) =>
                      setManifest((prev) => ({
                        ...prev,
                        brand_logo: prev.brand_logo
                          ? { ...prev.brand_logo, offset_y_mm: Number(e.target.value) }
                          : undefined,
                      }))
                    }
                    className="w-24 rounded border border-stone-200 px-2 py-1 font-mono text-xs font-bold"
                  />
                </div>
                <div className="pt-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                    <Upload size={13} className={uploadingLogo ? "animate-spin" : ""} />
                    {uploadingLogo ? "Uploading Vector..." : "Upload Logo (SVG/PNG)"}
                    <input
                      type="file"
                      accept=".svg,image/png"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Non-Printable Obstacles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Non-Printable Obstacle Zones (Handles, Vents, Chutes)
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Physical features on the front surface where customer elements cannot be printed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newObs: NonPrintableObstacle = {
                      id: `obs_${Date.now()}`,
                      name: "New Cutout Zone",
                      type: "handle",
                      offset_x_mm: 50,
                      offset_y_mm: 50,
                      width_mm: 100,
                      height_mm: 50,
                      status: "unverified",
                    };
                    setManifest((prev) => ({
                      ...prev,
                      obstacles: [...prev.obstacles, newObs],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                >
                  <Plus size={12} /> Add Zone
                </button>
              </div>

              <div className="space-y-2">
                {manifest.obstacles.map((obs) => (
                  <div
                    key={obs.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{obs.name}</span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                          {obs.type}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            obs.status === "factory_confirmed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {obs.status}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-stone-500">
                        Offset X: {obs.offset_x_mm}mm, Y: {obs.offset_y_mm}mm • Size: {obs.width_mm}×{obs.height_mm}mm
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setManifest((prev) => ({
                            ...prev,
                            obstacles: prev.obstacles.map((o) =>
                              o.id === obs.id
                                ? {
                                    ...o,
                                    status: o.status === "factory_confirmed" ? "unverified" : "factory_confirmed",
                                  }
                                : o
                            ),
                          }))
                        }
                        className="rounded border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                      >
                        Toggle Status
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setManifest((prev) => ({
                            ...prev,
                            obstacles: prev.obstacles.filter((o) => o.id !== obs.id),
                          }))
                        }
                        className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BLENDER HANDOVER SPEC */}
        {activeTab === "blender" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Blender 3D Artist Handover Specification
                </h4>
                <p className="text-[11px] text-stone-500">
                  Ready-to-share markdown technical instructions reflecting recorded millimeter measurements.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySpec}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
              >
                {copiedSpec ? <Check size={13} /> : <Copy size={13} />}
                {copiedSpec ? "Copied Specification!" : "Copy Specification"}
              </button>
            </div>

            <pre className="max-h-[380px] overflow-y-auto rounded-xl border border-stone-200 bg-stone-900 p-4 font-mono text-[11px] leading-relaxed text-stone-200">
              {generateBlenderSpecificationMarkdown(manifest)}
            </pre>
          </div>
        )}
      </div>

      {/* Modal Actions */}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Saving Intake..." : "Save Asset Intake Manifest"}
        </button>
      </div>
    </AdminDialog>
  );
}
