"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
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
  ExternalLink,
  X,
  Search,
  LayoutGrid,
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
  show_on_homepage?: boolean;
};

type RawProductImage = {
  storage_path: string;
  is_primary?: boolean | null;
};

type RawProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number | string | null;
  stock_quantity: number | string | null;
  is_active: boolean;
  category_id: string | null;
  product_images?: RawProductImage[] | null;
};

type ProductSimple = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  category_id: string | null;
  image?: string | null;
};

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  show_on_homepage: boolean;
};

const defaultForm: CategoryFormState = {
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
  is_active: true,
  show_on_homepage: true,
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
  const [allProducts, setAllProducts] = useState<ProductSimple[]>([]);
  const [hiddenFromHomepage, setHiddenFromHomepage] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);

  // Category Create / Edit Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormState>(defaultForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Manage Assigned Products Dialog State
  const [managingCategory, setManagingCategory] = useState<Category | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [updatingProduct, setUpdatingProduct] = useState<string | null>(null);

  // Delete Confirmation Dialog State
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);

    try {
      const [catRes, prodRes, secRes] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, slug, sku, price, stock_quantity, category_id, product_images(storage_path, is_primary)"),
        supabase
          .from("homepage_sections")
          .select("content")
          .eq("section_key", "category_showcase")
          .maybeSingle(),
      ]);

      if (catRes.error) {
        setToast({
          message: `Could not load categories: ${catRes.error.message}`,
          variant: "error",
        });
        setLoading(false);
        return;
      }

      // Check hidden category IDs from homepage sections config
      const hiddenIds: string[] = Array.isArray(
        secRes.data?.content?.hidden_category_ids
      )
        ? (secRes.data.content.hidden_category_ids as string[])
        : [];
      setHiddenFromHomepage(hiddenIds);

      // Map products
      const rawProducts = (prodRes.data || []) as unknown as RawProductRow[];
      const mappedProds: ProductSimple[] = rawProducts.map((p) => {
        const primaryImg = p.product_images?.find((img) => img.is_primary) || p.product_images?.[0];
        const rawPath = primaryImg?.storage_path;
        let imgUrl = null;
        if (rawPath) {
          imgUrl = /^https?:\/\//i.test(rawPath)
            ? rawPath
            : supabase.storage.from("product-media").getPublicUrl(rawPath.replace(/^product-media\//, "")).data.publicUrl;
        }
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          price: Number(p.price) || 0,
          stock_quantity: Number(p.stock_quantity) || 0,
          category_id: p.category_id,
          image: imgUrl,
        };
      });
      setAllProducts(mappedProds);

      // Count products per category
      const productCounts: Record<string, number> = {};
      mappedProds.forEach((p) => {
        if (p.category_id) {
          productCounts[p.category_id] =
            (productCounts[p.category_id] || 0) + 1;
        }
      });

      const enriched: Category[] = (catRes.data || []).map((c) => ({
        ...c,
        product_count: productCounts[c.id] || 0,
        show_on_homepage: !hiddenIds.includes(c.id),
      }));

      setCategories(enriched);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading categories";
      setToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function handleOpenCreate() {
    setEditingCategory(null);
    setFormData({
      ...defaultForm,
      sort_order: categories.length + 1,
    });
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
      show_on_homepage: cat.show_on_homepage !== false,
    });
    setImageFile(null);
    setImagePreview(
      cat.image_path
        ? supabase.storage
            .from("product-media")
            .getPublicUrl(cat.image_path.replace(/^product-media\//, "")).data.publicUrl
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

  async function updateHomepageVisibility(categoryId: string, visible: boolean) {
    try {
      let nextHidden = [...hiddenFromHomepage];
      if (visible) {
        nextHidden = nextHidden.filter((id) => id !== categoryId);
      } else {
        if (!nextHidden.includes(categoryId)) {
          nextHidden.push(categoryId);
        }
      }

      setHiddenFromHomepage(nextHidden);
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId ? { ...c, show_on_homepage: visible } : c
        )
      );

      // Persist to homepage_sections content
      const { data: sectionRow } = await supabase
        .from("homepage_sections")
        .select("content")
        .eq("section_key", "category_showcase")
        .maybeSingle();

      const updatedContent = {
        ...(sectionRow?.content || {}),
        hidden_category_ids: nextHidden,
      };

      await supabase
        .from("homepage_sections")
        .update({
          content: updatedContent,
          updated_at: new Date().toISOString(),
        })
        .eq("section_key", "category_showcase");

      setToast({
        message: visible
          ? "Category will appear on the homepage."
          : "Category hidden from homepage.",
        variant: "info",
      });
    } catch {
      // Non-blocking fallback
    }
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

      let savedId = editingCategory?.id;

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
        setToast({
          message: `Category "${formData.name}" updated successfully.`,
          variant: "success",
        });
      } else {
        // Create
        const { data: insertData, error: insertErr } = await supabase
          .from("categories")
          .insert({
            name: formData.name.trim(),
            slug: formData.slug.trim(),
            description: formData.description.trim() || null,
            image_path: imagePath,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        savedId = insertData.id;
        setToast({
          message: `Category "${formData.name}" created successfully.`,
          variant: "success",
        });
      }

      // Update homepage visibility
      if (savedId) {
        await updateHomepageVisibility(savedId, formData.show_on_homepage);
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
      setToast({
        message: `Failed to update status: ${error.message}`,
        variant: "error",
      });
    } else {
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextStatus } : c))
      );
      setToast({
        message: `Category "${cat.name}" is now ${
          nextStatus ? "active" : "archived"
        }.`,
        variant: "info",
      });
    }
  }

  async function handleMoveCategory(cat: Category, direction: "up" | "down") {
    const sorted = [...categories].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const index = sorted.findIndex((c) => c.id === cat.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;

    const target = sorted[targetIndex];

    // Ensure strictly unique sequential sort_order
    const newOrderCurrent = targetIndex + 1;
    const newOrderTarget = index + 1;

    try {
      await Promise.all([
        supabase
          .from("categories")
          .update({
            sort_order: newOrderCurrent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cat.id),
        supabase
          .from("categories")
          .update({
            sort_order: newOrderTarget,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id),
      ]);
      await loadCategories();
      setToast({
        message: `Moved "${cat.name}" ${direction}. Display order saved.`,
        variant: "success",
      });
    } catch {
      setToast({ message: "Could not reorder categories.", variant: "error" });
    }
  }

  // Product Assignment: Assign or Unassign
  async function handleAssignProduct(productId: string, newCategoryId: string | null) {
    setUpdatingProduct(productId);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          category_id: newCategoryId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);

      if (error) throw error;

      // Update local state immediately
      setAllProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, category_id: newCategoryId } : p
        )
      );

      // Recalculate counts
      await loadCategories();

      const prodName = allProducts.find((p) => p.id === productId)?.name || "Product";
      setToast({
        message: newCategoryId
          ? `Assigned "${prodName}" to category.`
          : `Removed "${prodName}" from category.`,
        variant: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update product category";
      setToast({ message: msg, variant: "error" });
    } finally {
      setUpdatingProduct(null);
    }
  }

  async function handleDeleteCategory() {
    if (!deletingCategory) return;
    setDeleteBusy(true);

    try {
      if (deletingCategory.product_count && deletingCategory.product_count > 0) {
        throw new Error(
          `Cannot delete category with ${deletingCategory.product_count} assigned products. Reassign or remove those products first.`
        );
      }

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deletingCategory.id);
      if (error) throw error;

      setToast({
        message: `Category "${deletingCategory.name}" deleted.`,
        variant: "success",
      });
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

  // Products belonging to the currently managed category
  const assignedProducts = managingCategory
    ? allProducts.filter((p) => p.category_id === managingCategory.id)
    : [];

  // Products available to be added to this category
  const unassignedProducts = managingCategory
    ? allProducts.filter(
        (p) =>
          p.category_id !== managingCategory.id &&
          (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase())))
      )
    : [];

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1400px] mx-auto w-full">
      <AdminHeader
        title="Product Categories"
        subtitle="Manage storefront categories, homepage visibility, display ordering, and product assignments."
        breadcrumbs={[{ label: "Catalogue" }, { label: "Categories" }]}
        actions={
          <>
            <button
              onClick={() => void loadCategories()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 transition"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#bf1e2e] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#a01824] transition"
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
                <div className="relative h-11 w-11 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {cat.image_path ? (
                    <Image
                      src={
                        supabase.storage
                          .from("product-media")
                          .getPublicUrl(cat.image_path.replace(/^product-media\//, "")).data.publicUrl
                      }
                      alt={cat.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <Layers size={18} className="text-stone-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-stone-900">{cat.name}</p>
                    <Link
                      href={`/categories/${cat.slug}`}
                      target="_blank"
                      className="text-stone-400 hover:text-[#bf1e2e] transition"
                      title="View live category page"
                    >
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                  <p className="text-[11px] text-stone-400 font-mono">/{cat.slug}</p>
                </div>
              </div>
            ),
          },
          {
            header: "Products",
            cell: (cat) => (
              <button
                type="button"
                onClick={() => setManagingCategory(cat)}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs hover:border-[#bf1e2e] hover:text-[#bf1e2e] transition"
                title="Click to view and manage products in this category"
              >
                <Package size={13} className="text-stone-400 group-hover:text-[#bf1e2e]" />
                <span>
                  {cat.product_count} {cat.product_count === 1 ? "model" : "models"}
                </span>
                <span className="text-[10px] text-stone-400 group-hover:text-[#bf1e2e]">
                  Manage ↗
                </span>
              </button>
            ),
          },
          {
            header: "Display Order",
            cell: (cat) => {
              const sorted = [...categories].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
              );
              const index = sorted.findIndex((c) => c.id === cat.id);
              return (
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-md bg-stone-100 px-2 py-0.5 text-xs font-mono font-bold text-stone-700">
                    #{cat.sort_order}
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => void handleMoveCategory(cat, "up")}
                      className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400 transition"
                      title="Move Up"
                    >
                      <MoveUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={index === sorted.length - 1}
                      onClick={() => void handleMoveCategory(cat, "down")}
                      className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400 transition"
                      title="Move Down"
                    >
                      <MoveDown size={12} />
                    </button>
                  </div>
                </div>
              );
            },
          },
          {
            header: "Homepage",
            cell: (cat) => (
              <button
                type="button"
                onClick={() =>
                  void updateHomepageVisibility(cat.id, !cat.show_on_homepage)
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                  cat.show_on_homepage
                    ? "bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100"
                    : "bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200"
                }`}
                title="Toggle visibility in the Homepage Shop by Category section"
              >
                <LayoutGrid size={11} />
                <span>{cat.show_on_homepage ? "Shown on Home" : "Hidden"}</span>
              </button>
            ),
          },
          {
            header: "Catalog Status",
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
                    <Eye size={12} /> Published
                  </>
                ) : (
                  <>
                    <EyeOff size={12} /> Unpublished
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
                  onClick={() => setManagingCategory(cat)}
                  className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
                  title="Assign Products"
                >
                  <Package size={15} />
                </button>
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
        title={
          editingCategory
            ? `Edit Category: ${editingCategory.name}`
            : "Create New Category"
        }
        description="Categories organize your products on the storefront, homepage discovery, and navigation menus."
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
              placeholder="e.g. Compact Range"
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
              onChange={(e) =>
                setFormData((p) => ({ ...p, slug: slugify(e.target.value) }))
              }
              placeholder="compact-range"
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
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Describe this collection for customers..."
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] focus:ring-2 focus:ring-[#bf1e2e]/10 transition"
            />
          </div>

          {/* Cover Image Upload */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Category Cover Image
            </label>
            <div className="flex items-center gap-4">
              {imagePreview ? (
                <div className="relative h-16 w-16 rounded-xl border border-stone-200 overflow-hidden shrink-0 bg-stone-50">
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-stone-400">
                  <Layers size={20} />
                </div>
              )}
              <div className="flex-1">
                <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 px-3.5 py-2 text-xs font-semibold text-stone-700 transition">
                  <Upload size={14} />
                  <span>{imagePreview ? "Change Cover Image" : "Upload Cover Image"}</span>
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
                <p className="mt-1 text-[11px] text-stone-400">
                  Recommended: 4:3 or 16:9 ratio, JPEG/PNG/WebP under 5MB.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                Display Sort Order
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    sort_order: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#bf1e2e] transition"
              />
            </div>

            <div className="flex flex-col justify-end space-y-2 pb-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, is_active: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#bf1e2e] focus:ring-[#bf1e2e]"
                />
                Published in Store
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.show_on_homepage}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      show_on_homepage: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-stone-300 text-[#bf1e2e] focus:ring-[#bf1e2e]"
                />
                Show on Homepage Carousel
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
              {submitting
                ? "Saving..."
                : editingCategory
                ? "Update Category"
                : "Create Category"}
            </button>
          </div>
        </form>
      </AdminDialog>

      {/* Manage Assigned Products Modal */}
      <AdminDialog
        isOpen={!!managingCategory}
        onClose={() => setManagingCategory(null)}
        title={`Products in "${managingCategory?.name}"`}
        description="Add products to this category or remove assigned models. Changes take effect immediately."
        maxWidth="lg"
      >
        <div className="space-y-6">
          {/* Currently Assigned Products */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Currently Assigned ({assignedProducts.length})
              </h4>
            </div>

            {assignedProducts.length === 0 ? (
              <p className="py-4 text-xs text-stone-500 italic">
                No products are currently assigned to this category. Select models below to assign them.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-stone-100 max-h-56 overflow-y-auto">
                {assignedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between py-2.5 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-10 w-10 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {prod.image ? (
                          <Image
                            src={prod.image}
                            alt={prod.name}
                            fill
                            className="object-contain p-1"
                          />
                        ) : (
                          <Package size={16} className="text-stone-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-stone-900 truncate">
                          {prod.name}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          SKU: {prod.sku || "N/A"} · Stock: {prod.stock_quantity}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={updatingProduct === prod.id}
                      onClick={() => void handleAssignProduct(prod.id, null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                    >
                      <X size={12} />
                      <span>Unassign</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Other Products to This Category */}
          <div className="border-t border-stone-200 pt-5">
            <div className="flex items-center justify-between pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Add Products to this Category
              </h4>
              <div className="relative w-48">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Filter products..."
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 pl-7 pr-2.5 py-1 text-xs outline-none focus:border-[#bf1e2e]"
                />
              </div>
            </div>

            {unassignedProducts.length === 0 ? (
              <p className="py-3 text-xs text-stone-500 italic">
                {productSearch
                  ? "No matching products found."
                  : "All store products are already assigned to this category."}
              </p>
            ) : (
              <div className="mt-2 divide-y divide-stone-100 max-h-56 overflow-y-auto">
                {unassignedProducts.map((prod) => {
                  const currentCat = categories.find(
                    (c) => c.id === prod.category_id
                  );

                  return (
                    <div
                      key={prod.id}
                      className="flex items-center justify-between py-2.5 gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-10 w-10 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {prod.image ? (
                            <Image
                              src={prod.image}
                              alt={prod.name}
                              fill
                              className="object-contain p-1"
                            />
                          ) : (
                            <Package size={16} className="text-stone-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate">
                            {prod.name}
                          </p>
                          <p className="text-[11px] text-stone-400">
                            Current:{" "}
                            {currentCat
                              ? currentCat.name
                              : "Uncategorised"}{" "}
                            · Stock: {prod.stock_quantity}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={updatingProduct === prod.id}
                        onClick={() =>
                          managingCategory &&
                          void handleAssignProduct(prod.id, managingCategory.id)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:border-[#bf1e2e] hover:bg-[#bf1e2e] hover:text-white transition disabled:opacity-50"
                      >
                        <Plus size={12} />
                        <span>Assign</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setManagingCategory(null)}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition"
            >
              Done
            </button>
          </div>
        </div>
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
            This action cannot be undone. Category:{" "}
            <strong>{deletingCategory?.name}</strong>.
          </p>

          {deletingCategory?.product_count &&
          deletingCategory.product_count > 0 ? (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
              Warning: This category currently has {deletingCategory.product_count} product(s) assigned. You must reassign or remove those products before deleting this category.
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
              disabled={
                deleteBusy ||
                Boolean(
                  deletingCategory?.product_count &&
                    deletingCategory.product_count > 0
                )
              }
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
