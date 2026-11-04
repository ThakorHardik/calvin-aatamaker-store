"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Upload,
  Package,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminTable } from "@/components/admin/admin-table";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminToast } from "@/components/admin/admin-toast";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  product_count?: number;
};

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

const defaultForm: CategoryFormState = {
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
  is_active: true,
};

function slugify(val: string) {
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormState>(defaultForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation Dialog
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);

    const [catRes, prodRes] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("products").select("category_id"),
    ]);

    if (catRes.error) {
      setToast({ message: `Could not load categories: ${catRes.error.message}`, variant: "error" });
      setLoading(false);
      return;
    }

    // Count products per category
    const productCounts: Record<string, number> = {};
    (prodRes.data || []).forEach((p) => {
      if (p.category_id) {
        productCounts[p.category_id] = (productCounts[p.category_id] || 0) + 1;
      }
    });

    const enriched = (catRes.data || []).map((c) => ({
      ...c,
      product_count: productCounts[c.id] || 0,
    }));

    setCategories(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function handleOpenCreate() {
    setEditingCategory(null);
    setFormData(defaultForm);
    setImageFile(null);
    setImagePreview(null);
    setIsDialogOpen(true);
  }

  function handleOpenEdit(cat: Category) {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active,
    });
    setImageFile(null);
    setImagePreview(
      cat.image_path
        ? supabase.storage.from("product-media").getPublicUrl(cat.image_path).data.publicUrl
        : null
    );
    setIsDialogOpen(true);
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingCategory ? prev.slug : slugify(name),
    }));
  }

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      let imagePath = editingCategory?.image_path || null;

      // Upload category image if new file selected
      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const filename = `category-${slugify(formData.name)}-${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("product-media")
          .upload(filename, imageFile, { upsert: true });

        if (uploadErr) {
          throw new Error(`Failed to upload image: ${uploadErr.message}`);
        }
        imagePath = uploadData.path;
      }

      if (editingCategory) {
        // Update
        const { error: updateErr } = await supabase
          .from("categories")
          .update({
            name: formData.name.trim(),
            slug: formData.slug.trim(),
            description: formData.description.trim() || null,
            image_path: imagePath,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingCategory.id);

        if (updateErr) throw updateErr;
        setToast({ message: `Category "${formData.name}" updated successfully.`, variant: "success" });
      } else {
        // Create
        const { error: insertErr } = await supabase.from("categories").insert({
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null,
          image_path: imagePath,
          sort_order: formData.sort_order,
          is_active: formData.is_active,
        });

        if (insertErr) throw insertErr;
        setToast({ message: `Category "${formData.name}" created successfully.`, variant: "success" });
      }

      setIsDialogOpen(false);
      await loadCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving category";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(cat: Category) {
    const nextStatus = !cat.is_active;
    const { error } = await supabase
      .from("categories")
      .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", cat.id);

    if (error) {
      setToast({ message: `Failed to update status: ${error.message}`, variant: "error" });
    } else {
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextStatus } : c))
      );
      setToast({
        message: `Category "${cat.name}" is now ${nextStatus ? "active" : "archived"}.`,
        variant: "info",
      });
    }
  }

  async function handleMoveCategory(cat: Category, direction: "up" | "down") {
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const index = sorted.findIndex((c) => c.id === cat.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;

    const target = sorted[targetIndex];
    let newOrderCurrent = target.sort_order;
    const newOrderTarget = cat.sort_order;
    if (newOrderCurrent === newOrderTarget) {
      newOrderCurrent = direction === "up" ? newOrderTarget - 1 : newOrderTarget + 1;
    }

    try {
      await Promise.all([
        supabase
          .from("categories")
          .update({ sort_order: newOrderCurrent, updated_at: new Date().toISOString() })
          .eq("id", cat.id),
        supabase
          .from("categories")
          .update({ sort_order: newOrderTarget, updated_at: new Date().toISOString() })
          .eq("id", target.id),
      ]);
      await loadCategories();
      setToast({ message: `Reordered "${cat.name}".`, variant: "info" });
    } catch {
      setToast({ message: "Could not reorder categories.", variant: "error" });
    }
  }

  async function handleDeleteCategory() {
    if (!deletingCategory) return;
    setDeleteBusy(true);

    try {
      if (deletingCategory.product_count && deletingCategory.product_count > 0) {
        throw new Error(
          `Cannot delete category with ${deletingCategory.product_count} assigned products. Reassign products first.`
        );
      }

      const { error } = await supabase.from("categories").delete().eq("id", deletingCategory.id);
      if (error) throw error;

      setToast({ message: `Category "${deletingCategory.name}" deleted.`, variant: "success" });
      setDeletingCategory(null);
      await loadCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error deleting category";
      setToast({ message: msg, variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1400px] mx-auto w-full">
      <AdminHeader
        title="Product Categories"
        subtitle="Organize store inventory into customer-facing catalog classifications."
        breadcrumbs={[{ label: "Catalogue" }, { label: "Categories" }]}
        actions={
          <>
            <button
              onClick={() => void loadCategories()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#bf1e2e] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#a01824] transition"
            >
              <Plus size={14} />
              Add Category
            </button>
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

      {/* Categories Table */}
      <AdminTable
        columns={[
          {
            header: "Category",
            cell: (cat) => (
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {cat.image_path ? (
                    <Image
                      src={supabase.storage.from("product-media").getPublicUrl(cat.image_path).data.publicUrl}
                      alt={cat.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Layers size={18} className="text-stone-400" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-stone-900">{cat.name}</p>
                  <p className="text-[11px] text-stone-400">/{cat.slug}</p>
                </div>
              </div>
            ),
          },
          {
            header: "Products",
            cell: (cat) => (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-600">
                <Package size={13} className="text-stone-400" />
                {cat.product_count} {cat.product_count === 1 ? "unit" : "units"}
              </span>
            ),
          },
          {
            header: "Sort Order",
            cell: (cat) => {
              const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              const index = sorted.findIndex((c) => c.id === cat.id);
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-500 font-mono w-6">#{cat.sort_order}</span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => void handleMoveCategory(cat, "up")}
                      className="p-0.5 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400"
                      title="Move Up"
                    >
                      <MoveUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={index === sorted.length - 1}
                      onClick={() => void handleMoveCategory(cat, "down")}
                      className="p-0.5 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400"
                      title="Move Down"
                    >
                      <MoveDown size={11} />
                    </button>
                  </div>
                </div>
              );
            },
          },
          {
            header: "Status",
            cell: (cat) => (
              <button
                type="button"
                onClick={() => handleToggleActive(cat)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                  cat.is_active
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {cat.is_active ? (
                  <>
                    <Eye size={12} /> Active
                  </>
                ) : (
                  <>
                    <EyeOff size={12} /> Archived
                  </>
                )}
              </button>
            ),
          },
          {
            header: "Actions",
            className: "text-right",
            cell: (cat) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(cat)}
                  className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
                  title="Edit Category"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingCategory(cat)}
                  className="p-1.5 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                  title="Delete Category"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
          },
        ]}
        data={filteredCategories}
        keyExtractor={(cat) => cat.id}
        loading={loading}
        emptyMessage="No categories created yet."
        searchPlaceholder="Search categories by name or slug..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      {/* Category Create / Edit Modal */}
      <AdminDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={editingCategory ? `Edit Category: ${editingCategory.name}` : "Create New Category"}
        description="Categories organize your products on the storefront and navigation menus."
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Domestic Flour Mills"
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              URL Slug *
            </label>
            <input
              type="text"
              required
              value={formData.slug}
              onChange={(e) => setFormData((p) => ({ ...p, slug: slugify(e.target.value) }))}
              placeholder="domestic-flour-mills"
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short description displayed on catalog header..."
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Category Thumbnail Image
            </label>
            <div className="flex items-center gap-4">
              {imagePreview && (
                <div className="relative h-16 w-16 rounded-xl border border-stone-200 overflow-hidden shrink-0">
                  <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 px-3.5 py-2 text-xs font-medium text-stone-700 transition">
                <Upload size={14} />
                <span>{imagePreview ? "Change Image" : "Upload Image"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] transition"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-stone-300 text-[#bf1e2e] focus:ring-[#bf1e2e]"
                />
                Category is Active
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#bf1e2e] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#a01824] transition disabled:opacity-50"
            >
              {submitting ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
            </button>
          </div>
        </form>
      </AdminDialog>

      {/* Delete Confirmation Dialog */}
      <AdminDialog
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        title="Delete Category"
        description="Are you sure you want to delete this category?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            This action cannot be undone. Category: <strong>{deletingCategory?.name}</strong>.
          </p>

          {deletingCategory?.product_count && deletingCategory.product_count > 0 ? (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
              Warning: This category has {deletingCategory.product_count} product(s) assigned. You must reassign or remove those products before deleting this category.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setDeletingCategory(null)}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteCategory}
              disabled={deleteBusy || Boolean(deletingCategory?.product_count && deletingCategory.product_count > 0)}
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
