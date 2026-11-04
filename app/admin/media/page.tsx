"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import {
  Images,
  Upload,
  RefreshCw,
  Search,
  Trash2,
  Check,
  Copy,
  AlertTriangle,
  Video,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminToast } from "@/components/admin/admin-toast";

type StorageBucketName = "product-media" | "banner-media";

type MediaAsset = {
  id: string;
  name: string;
  bucket: StorageBucketName;
  sizeBytes: number;
  createdAt: string;
  publicUrl: string;
  isVideo: boolean;
  isInUse?: boolean;
  usageContext?: string;
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
];

export default function AdminMediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState<StorageBucketName | "all">("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  // Upload State
  const [uploadBucket, setUploadBucket] = useState<StorageBucketName>("product-media");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Asset Detail / Delete State
  const [activeAsset, setActiveAsset] = useState<MediaAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<MediaAsset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const bucketsToLoad: StorageBucketName[] = ["product-media", "banner-media"];
      const allAssets: MediaAsset[] = [];

      // Also query active usage to protect assets in use
      const [prodImagesRes, bannersRes] = await Promise.all([
        supabase.from("product_images").select("storage_path"),
        supabase.from("banners").select("media_path"),
      ]);

      const inUseProductPaths = new Set(
        (prodImagesRes.data || []).map((img) => img.storage_path)
      );
      const inUseBannerPaths = new Set(
        (bannersRes.data || []).map((b) => b.media_path)
      );

      for (const bucket of bucketsToLoad) {
        const { data, error } = await supabase.storage.from(bucket).list("", {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

        if (error) {
          console.warn(`Error loading bucket ${bucket}:`, error.message);
          continue;
        }

        (data || []).forEach((file) => {
          if (!file.name || file.name.startsWith(".")) return;

          const isVideo = file.name.endsWith(".mp4") || file.name.endsWith(".webm");
          const publicUrl = supabase.storage.from(bucket).getPublicUrl(file.name).data.publicUrl;
          const isInUse =
            bucket === "product-media"
              ? inUseProductPaths.has(file.name)
              : inUseBannerPaths.has(file.name);

          allAssets.push({
            id: `${bucket}-${file.name}`,
            name: file.name,
            bucket,
            sizeBytes: file.metadata?.size || 0,
            createdAt: file.created_at || new Date().toISOString(),
            publicUrl,
            isVideo,
            isInUse,
            usageContext: isInUse
              ? bucket === "product-media"
                ? "Active Product Gallery"
                : "Active Hero Banner"
              : undefined,
          });
        });
      }

      setAssets(allAssets);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load media assets";
      setToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(`Uploading ${files.length} file(s)...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!ALLOWED_TYPES.includes(file.type)) {
          throw new Error(`File "${file.name}" has unsupported type: ${file.type}`);
        }

        const isVideo = file.type.startsWith("video/");
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        if (file.size > maxSize) {
          throw new Error(
            `File "${file.name}" exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB.`
          );
        }

        const cleanName = file.name
          .toLowerCase()
          .replace(/[^a-z0-9.-]/g, "-")
          .replace(/-+/g, "-");
        const uniquePath = `${Date.now()}-${cleanName}`;

        const { error } = await supabase.storage
          .from(uploadBucket)
          .upload(uniquePath, file, { cacheControl: "3600", upsert: false });

        if (error) {
          throw new Error(`Upload error for ${file.name}: ${error.message}`);
        }
      }

      setToast({ message: "Files uploaded successfully.", variant: "success" });
      await loadMedia();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setToast({ message: msg, variant: "error" });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      e.target.value = "";
    }
  }

  async function handleDeleteAsset() {
    if (!deletingAsset) return;
    setDeleteBusy(true);

    try {
      if (deletingAsset.isInUse) {
        throw new Error(
          `Cannot delete asset referenced by ${deletingAsset.usageContext}. Remove it from the product/banner first.`
        );
      }

      const { error } = await supabase.storage
        .from(deletingAsset.bucket)
        .remove([deletingAsset.name]);

      if (error) throw error;

      setToast({ message: `Asset "${deletingAsset.name}" removed from ${deletingAsset.bucket}.`, variant: "success" });
      setDeletingAsset(null);
      if (activeAsset?.id === deletingAsset.id) setActiveAsset(null);
      await loadMedia();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error deleting asset";
      setToast({ message: msg, variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleCopyUrl(url: string) {
    void navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  const filteredAssets = assets.filter((asset) => {
    const matchesBucket = selectedBucket === "all" || asset.bucket === selectedBucket;
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase());
    return matchesBucket && matchesSearch;
  });

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1500px] mx-auto w-full">
      <AdminHeader
        title="Media Library"
        subtitle="Manage product photography, banner artwork, and storefront media assets across Supabase storage."
        breadcrumbs={[{ label: "Catalogue" }, { label: "Media Library" }]}
        actions={
          <>
            <button
              onClick={() => void loadMedia()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>

            <div className="flex items-center gap-2">
              <select
                value={uploadBucket}
                onChange={(e) => setUploadBucket(e.target.value as StorageBucketName)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 outline-none"
              >
                <option value="product-media">Bucket: product-media</option>
                <option value="banner-media">Bucket: banner-media</option>
              </select>

              <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-[#bf1e2e] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#a01824] transition">
                <Upload size={14} />
                <span>Upload Media</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </>
        }
      />

      {toast && (
        <AdminToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          className="mb-5"
        />
      )}

      {uploadProgress && (
        <div className="mb-5 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs font-medium text-stone-700 flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin text-[#bf1e2e]" />
          {uploadProgress}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets by filename..."
            className="w-full rounded-xl border border-stone-200 bg-stone-50/50 pl-9 pr-3.5 py-2 text-xs outline-none focus:border-stone-400 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setSelectedBucket("all")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              selectedBucket === "all"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            All Buckets ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedBucket("product-media")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              selectedBucket === "product-media"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Product Media
          </button>
          <button
            type="button"
            onClick={() => setSelectedBucket("banner-media")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              selectedBucket === "banner-media"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Banner Media
          </button>
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-2xl border border-stone-200/80 bg-white p-12 text-center text-stone-400">
          <Images size={40} className="mx-auto mb-2 text-stone-300 stroke-[1.5]" />
          <p className="text-sm font-semibold text-stone-700">No media assets found</p>
          <p className="text-xs text-stone-400 mt-1">Upload images or videos to populate this storage bucket.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setActiveAsset(asset)}
              className={`group relative flex flex-col rounded-2xl border bg-white p-2 shadow-2xs hover:shadow-sm cursor-pointer transition overflow-hidden ${
                activeAsset?.id === asset.id ? "border-[#bf1e2e] ring-2 ring-[#bf1e2e]/20" : "border-stone-200/80"
              }`}
            >
              <div className="relative aspect-square w-full rounded-xl bg-stone-100 overflow-hidden flex items-center justify-center">
                {asset.isVideo ? (
                  <div className="flex flex-col items-center justify-center text-stone-500">
                    <Video size={28} />
                    <span className="text-[10px] font-bold mt-1 uppercase">Video</span>
                  </div>
                ) : (
                  <Image
                    src={asset.publicUrl}
                    alt={asset.name}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                )}

                {asset.isInUse && (
                  <span className="absolute top-2 left-2 rounded-md bg-stone-900/80 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    In Use
                  </span>
                )}
              </div>

              <div className="mt-2 px-1">
                <p className="text-xs font-semibold text-stone-800 truncate" title={asset.name}>
                  {asset.name}
                </p>
                <div className="flex items-center justify-between text-[10px] text-stone-400 mt-0.5">
                  <span>{asset.bucket}</span>
                  <span>{formatBytes(asset.sizeBytes)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset Detail Slide-Over Dialog */}
      <AdminDialog
        isOpen={!!activeAsset}
        onClose={() => setActiveAsset(null)}
        title="Asset Properties"
        maxWidth="md"
      >
        {activeAsset && (
          <div className="space-y-4">
            <div className="relative aspect-video w-full rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center">
              {activeAsset.isVideo ? (
                <video src={activeAsset.publicUrl} controls className="h-full w-full object-contain" />
              ) : (
                <Image src={activeAsset.publicUrl} alt={activeAsset.name} fill className="object-contain" />
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">File Name</span>
                <span className="font-semibold text-stone-800 break-all">{activeAsset.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Bucket</span>
                <span className="font-mono text-stone-700">{activeAsset.bucket}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">File Size</span>
                <span className="text-stone-700">{formatBytes(activeAsset.sizeBytes)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Usage Status</span>
                <span className={`font-semibold ${activeAsset.isInUse ? "text-emerald-700" : "text-stone-500"}`}>
                  {activeAsset.isInUse ? `In Use (${activeAsset.usageContext})` : "Unreferenced"}
                </span>
              </div>
            </div>

            {/* Public URL Box */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
                Public URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeAsset.publicUrl}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-mono text-stone-600 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopyUrl(activeAsset.publicUrl)}
                  className="shrink-0 p-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition"
                  title="Copy URL"
                >
                  {copiedUrl ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeletingAsset(activeAsset)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 transition"
              >
                <Trash2 size={14} /> Delete Asset
              </button>

              <button
                type="button"
                onClick={() => setActiveAsset(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </AdminDialog>

      {/* Delete Confirmation Dialog */}
      <AdminDialog
        isOpen={!!deletingAsset}
        onClose={() => setDeletingAsset(null)}
        title="Delete Media Asset"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            Are you sure you want to remove <strong>{deletingAsset?.name}</strong> from{" "}
            <strong>{deletingAsset?.bucket}</strong>?
          </p>

          {deletingAsset?.isInUse ? (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Safety Lock: This media is referenced by {deletingAsset.usageContext}. Deleting it will result in broken storefront images. Remove the media reference first.
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-stone-400">
              This action permanently deletes the file from Supabase storage.
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setDeletingAsset(null)}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAsset}
              disabled={deleteBusy || Boolean(deletingAsset?.isInUse)}
              className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 transition disabled:opacity-50"
            >
              {deleteBusy ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        </div>
      </AdminDialog>
    </main>
  );
}
