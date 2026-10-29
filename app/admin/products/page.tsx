"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Upload,
  X,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
};

type ProductImage = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
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
  dimensions_cm: Record<string, string | null>;
  is_customisable: boolean;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  categories?: { name: string } | null;
  product_images?: ProductImage[];
};

type ProductForm = {
  name: string;
  category_id: string;
  sku: string;
  short_description: string;
  description: string;
  price: string;
  compare_at_price: string;
  stock_quantity: string;
  height: string;
  width: string;
  depth: string;
  is_customisable: boolean;
  is_featured: boolean;
  is_active: boolean;
};

type ExistingGalleryItem = {
  key: string;
  kind: "existing";
  image: ProductImage;
};

type NewGalleryItem = {
  key: string;
  kind: "new";
  file: File;
  previewUrl: string;
};

type GalleryItem = ExistingGalleryItem | NewGalleryItem;

const MAX_IMAGES = 8;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const allowedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const blankForm: ProductForm = {
  name: "",
  category_id: "",
  sku: "",
  short_description: "",
  description: "",
  price: "",
  compare_at_price: "",
  stock_quantity: "0",
  height: "88",
  width: "48",
  depth: "34",
  is_customisable: true,
  is_featured: false,
  is_active: false,
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-100";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function mediaUrl(path: string) {
  return supabase.storage.from("product-media").getPublicUrl(path).data
    .publicUrl;
}

function sortedImages(images: ProductImage[] = []) {
  return [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}

export default function ProductsAdminPage() {
  const [checking, setChecking] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [primaryKey, setPrimaryKey] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const galleryRef = useRef<GalleryItem[]>([]);

  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  useEffect(() => {
    return () => {
      galleryRef.current.forEach((item) => {
        if (item.kind === "new") URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const loadData = useCallback(async () => {
    const [cat, prod] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase
        .from("products")
        .select("*, categories(name), product_images(*)")
        .order("created_at", { ascending: false }),
    ]);

    if (cat.error || prod.error) {
      setNotice(
        `Could not load catalogue: ${cat.error?.message ?? prod.error?.message}`,
      );
      return;
    }

    setCategories((cat.data ?? []) as Category[]);
    setProducts((prod.data ?? []) as unknown as Product[]);
  }, []);

  const checkAdmin = useCallback(
    async (id: string, userEmail = "") => {
      setUserId(id);
      const { data, error } = await supabase
        .from("profiles")
        .select("role, email")
        .eq("id", id)
        .maybeSingle();

      if (error || data?.role !== "admin") {
        setAdmin(false);
        setNotice(
          error?.message ??
            "This account is not assigned administrator access.",
        );
        setChecking(false);
        return;
      }

      setEmail(data.email ?? userEmail);
      setAdmin(true);
      setNotice("");
      setChecking(false);
      void loadData();
    },
    [loadData],
  );

  useEffect(() => {
    let mounted = true;

    async function initialise() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setNotice(error.message);
        setChecking(false);
        return;
      }
      if (data.session) {
        await checkAdmin(data.session.user.id, data.session.user.email ?? "");
      } else {
        setChecking(false);
      }
    }

    void initialise();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setAdmin(false);
        setUserId("");
        setProducts([]);
        setCategories([]);
        setChecking(false);
        return;
      }
      if (event === "SIGNED_IN") {
        window.setTimeout(() => {
          if (mounted)
            void checkAdmin(session.user.id, session.user.email ?? "");
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAdmin]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    setPassword("");
    if (error) setNotice(error.message);
  }

  function clearGallery() {
    gallery.forEach((item) => {
      if (item.kind === "new") URL.revokeObjectURL(item.previewUrl);
    });
    setGallery([]);
    setPrimaryKey("");
  }

  function chooseImages(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const remainingSlots = MAX_IMAGES - gallery.length;
    const accepted: NewGalleryItem[] = [];
    let warning = "";

    for (const file of files) {
      if (!allowedImageTypes.includes(file.type)) {
        warning = `${file.name}: choose a JPG, PNG, WebP or AVIF image.`;
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        warning = `${file.name}: image files must be 8 MB or smaller.`;
        continue;
      }
      if (accepted.length >= remainingSlots) {
        warning = `A product can have up to ${MAX_IMAGES} images. Remove an image before adding more.`;
        break;
      }
      accepted.push({
        key: `new:${crypto.randomUUID()}`,
        kind: "new",
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (accepted.length > 0) {
      setGallery((current) => [...current, ...accepted]);
      if (gallery.length === 0) setPrimaryKey(accepted[0].key);
    }

    setNotice(warning);
  }

  function removeGalleryItem(key: string) {
    const item = gallery.find((entry) => entry.key === key);
    if (item?.kind === "new") URL.revokeObjectURL(item.previewUrl);
    const next = gallery.filter((entry) => entry.key !== key);
    setGallery(next);
    if (primaryKey === key) setPrimaryKey(next[0]?.key ?? "");
    setNotice("");
  }

  function moveGalleryItem(key: string, direction: -1 | 1) {
    const index = gallery.findIndex((item) => item.key === key);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= gallery.length) return;
    const next = [...gallery];
    [next[index], next[destination]] = [next[destination], next[index]];
    setGallery(next);
  }

  function openNewProduct() {
    clearGallery();
    setEditing(null);
    setForm({ ...blankForm, category_id: categories[0]?.id ?? "" });
    setNotice("");
    setShowForm(true);
  }

  function openEditProduct(product: Product) {
    clearGallery();
    const images = sortedImages(product.product_images ?? []);
    const savedItems: ExistingGalleryItem[] = images.map((image) => ({
      key: `existing:${image.id}`,
      kind: "existing",
      image,
    }));

    setEditing(product);
    setForm({
      name: product.name,
      category_id: product.category_id ?? "",
      sku: product.sku ?? "",
      short_description: product.short_description ?? "",
      description: product.description ?? "",
      price: String(product.price),
      compare_at_price:
        product.compare_at_price == null
          ? ""
          : String(product.compare_at_price),
      stock_quantity: String(product.stock_quantity),
      height: product.dimensions_cm?.height ?? "",
      width: product.dimensions_cm?.width ?? "",
      depth: product.dimensions_cm?.depth ?? "",
      is_customisable: product.is_customisable,
      is_featured: product.is_featured,
      is_active: product.is_active,
    });
    setGallery(savedItems);
    setPrimaryKey(
      savedItems.find((item) => item.image.is_primary)?.key ??
        savedItems[0]?.key ??
        "",
    );
    setNotice("");
    setShowForm(true);
  }

  function closeProductForm() {
    clearGallery();
    setShowForm(false);
    setEditing(null);
    setForm(blankForm);
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setBusy(true);
    setNotice("");

    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: categoryName.trim(),
        slug: slugify(categoryName),
        description: categoryDescription.trim() || null,
      })
      .select("*")
      .single();

    setBusy(false);
    if (error) {
      setNotice(`Category not saved: ${error.message}`);
      return;
    }

    setCategories((items) => [...items, data as Category]);
    setForm((current) => ({ ...current, category_id: data.id }));
    setCategoryName("");
    setCategoryDescription("");
    setShowCategoryForm(false);
    setNotice("Category created successfully.");
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      setNotice("Please sign in again.");
      return;
    }

    const price = Number(form.price);
    const stock = Number(form.stock_quantity);
    if (!form.name.trim() || form.price.trim() === "") {
      setNotice("Product name and selling price are required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setNotice("Enter a valid non-negative price.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setNotice("Stock must be a whole number of zero or more.");
      return;
    }
    if (
      form.compare_at_price &&
      (!Number.isFinite(Number(form.compare_at_price)) ||
        Number(form.compare_at_price) < 0)
    ) {
      setNotice("Enter a valid compare-at price.");
      return;
    }
    if (gallery.length === 0) {
      setNotice("Add at least one product image before saving this product.");
      return;
    }

    setBusy(true);
    setNotice("");
    let productId = editing?.id;
    const uploadedPaths: string[] = [];
    const insertedImageIds: string[] = [];
    let createdProduct = false;
    let storageWarning = "";

    try {
      const slug =
        editing && editing.name === form.name.trim()
          ? editing.slug
          : `${slugify(form.name)}-${crypto.randomUUID().slice(0, 6)}`;

      const payload = {
        category_id: form.category_id || null,
        name: form.name.trim(),
        slug,
        sku: form.sku.trim() || null,
        short_description: form.short_description.trim() || null,
        description: form.description.trim(),
        price,
        compare_at_price:
          form.compare_at_price.trim() === ""
            ? null
            : Number(form.compare_at_price),
        stock_quantity: stock,
        dimensions_cm: {
          height: form.height.trim() || null,
          width: form.width.trim() || null,
          depth: form.depth.trim() || null,
        },
        is_customisable: form.is_customisable,
        is_featured: form.is_featured,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
        createdProduct = true;
      }

      if (!productId) throw new Error("Could not determine the product ID.");

      const idForGalleryKey = new Map<string, string>();
      const removedExisting = (editing?.product_images ?? []).filter(
        (image) => !gallery.some((item) => item.key === `existing:${image.id}`),
      );

      // Save each newly selected image first. If an upload fails, the new files can
      // be cleaned up without deleting the product's previously saved images.
      for (let index = 0; index < gallery.length; index += 1) {
        const item = gallery[index];
        if (item.kind === "existing") {
          idForGalleryKey.set(item.key, item.image.id);
          continue;
        }

        const extension =
          item.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${productId}/${crypto.randomUUID()}.${extension}`;
        uploadedPaths.push(path);
        const { error: uploadError } = await supabase.storage
          .from("product-media")
          .upload(path, item.file, {
            contentType: item.file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const { data: savedImage, error: insertImageError } = await supabase
          .from("product_images")
          .insert({
            product_id: productId,
            storage_path: path,
            alt_text: form.name.trim(),
            sort_order: index,
            is_primary: false,
          })
          .select("id")
          .single();
        if (insertImageError) throw insertImageError;
        insertedImageIds.push(savedImage.id);
        idForGalleryKey.set(item.key, savedImage.id);
      }

      // Keep the order shown in the editor as the saved gallery order.
      for (let index = 0; index < gallery.length; index += 1) {
        const item = gallery[index];
        if (item.kind !== "existing") continue;
        const { error } = await supabase
          .from("product_images")
          .update({ sort_order: index })
          .eq("id", item.image.id)
          .eq("product_id", productId);
        if (error) throw error;
      }

      if (removedExisting.length > 0) {
        const { error } = await supabase
          .from("product_images")
          .delete()
          .in(
            "id",
            removedExisting.map((image) => image.id),
          )
          .eq("product_id", productId);
        if (error) throw error;
      }

      // Exactly one selected image becomes the primary image.
      const { error: resetPrimaryError } = await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", productId);
      if (resetPrimaryError) throw resetPrimaryError;

      const selectedKey = gallery.some((item) => item.key === primaryKey)
        ? primaryKey
        : gallery[0]?.key;
      const selectedImageId = selectedKey
        ? idForGalleryKey.get(selectedKey)
        : undefined;
      if (!selectedImageId)
        throw new Error("Select a primary image before saving.");

      const { error: setPrimaryError } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", selectedImageId)
        .eq("product_id", productId);
      if (setPrimaryError) throw setPrimaryError;

      const removedPaths = removedExisting.map((image) => image.storage_path);
      if (removedPaths.length > 0) {
        const { error } = await supabase.storage
          .from("product-media")
          .remove(removedPaths);
        if (error)
          storageWarning =
            " Product saved, but one or more removed image files could not be cleaned up from storage.";
      }

      const successMessage = editing
        ? "Product updated successfully."
        : "Product created successfully.";
      closeProductForm();
      setNotice(`${successMessage}${storageWarning}`);
      await loadData();
    } catch (error) {
      if (insertedImageIds.length > 0) {
        await supabase
          .from("product_images")
          .delete()
          .in("id", insertedImageIds);
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("product-media").remove(uploadedPaths);
      }
      if (createdProduct && productId) {
        await supabase.from("products").delete().eq("id", productId);
      }
      setNotice(
        error instanceof Error
          ? `Could not save product: ${error.message}`
          : "Unable to save product. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(product: Product) {
    const confirmed = window.confirm(
      product.is_active
        ? `Archive “${product.name}”? It will no longer be visible to shoppers.`
        : `Publish “${product.name}” on the storefront?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setNotice("");
    const { error } = await supabase
      .from("products")
      .update({
        is_active: !product.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id);
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(product.is_active ? "Product archived." : "Product published.");
      await loadData();
    }
  }

  const visibleProducts = products.filter(
    (product) =>
      `${product.name} ${product.sku ?? ""} ${product.categories?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!activeOnly || product.is_active),
  );

  if (checking) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-stone-500">
        <LoaderCircle className="mr-2 animate-spin" size={18} /> Checking
        administrator access…
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-5">
        <form
          onSubmit={signIn}
          className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-7 shadow-sm"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
            Calvin Aatamaker
          </p>
          <h1 className="text-2xl font-bold">Admin sign in</h1>
          <p className="text-sm text-stone-500">
            Sign in with the administrator account created in Supabase.
          </p>
          <label className="block text-sm font-medium">
            Email
            <input
              className={fieldClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={fieldClass}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {notice && (
            <p role="alert" className="break-words text-sm text-red-700">
              {notice}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
              Catalogue management
            </p>
            <h1 className="mt-1 text-2xl font-bold">Products & categories</h1>
            <p className="mt-1 text-sm text-stone-500">
              Manage product details, pricing, inventory and product
              photography.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadData()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              onClick={() => setShowCategoryForm((current) => !current)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              <Tag size={15} /> Add category
            </button>
            <button
              onClick={openNewProduct}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
            >
              <Plus size={16} /> Add product
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-700" />
            <span className="break-words text-stone-700">{notice}</span>
            <button
              className="ml-auto text-xs font-semibold text-stone-500 hover:text-stone-900"
              onClick={() => setNotice("")}
            >
              Dismiss
            </button>
          </div>
        )}

        {showCategoryForm && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Create a category</h2>
            <form
              onSubmit={createCategory}
              className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end"
            >
              <label className="block text-sm font-medium">
                Category name
                <input
                  className={fieldClass}
                  required
                  maxLength={100}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Compact Range"
                />
              </label>
              <label className="block text-sm font-medium">
                Description (optional)
                <input
                  className={fieldClass}
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="Describe this collection"
                />
              </label>
              <button
                disabled={busy}
                className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save category
              </button>
            </form>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Total products"
            value={products.length}
            detail="Saved in database"
            icon={Package}
          />
          <SummaryCard
            title="Published"
            value={products.filter((product) => product.is_active).length}
            detail="Visible on the public store"
            icon={CheckCircle2}
          />
          <SummaryCard
            title="Categories"
            value={categories.length}
            detail="Available collections"
            icon={Tag}
          />
        </section>

        {showForm && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-red-700">
                  Product editor
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {editing ? "Edit product" : "Add a product"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Product details and gallery images will be saved to Supabase.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductForm}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
              >
                <X size={16} /> Cancel
              </button>
            </div>

            <form onSubmit={saveProduct} className="space-y-7">
              <section>
                <h3 className="mb-4 text-base font-bold">Basic information</h3>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Product name *
                    <input
                      className={fieldClass}
                      required
                      maxLength={160}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Compact Domestic Aatamaker"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Category
                    <select
                      className={fieldClass}
                      value={form.category_id}
                      onChange={(e) =>
                        setForm({ ...form, category_id: e.target.value })
                      }
                    >
                      <option value="">Uncategorised</option>
                      {categories
                        .filter((category) => category.is_active)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Selling price (₹) *
                    <input
                      className={fieldClass}
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) =>
                        setForm({ ...form, price: e.target.value })
                      }
                      placeholder="Enter confirmed price"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Compare-at price (₹)
                    <input
                      className={fieldClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.compare_at_price}
                      onChange={(e) =>
                        setForm({ ...form, compare_at_price: e.target.value })
                      }
                      placeholder="Optional original price"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    SKU (optional)
                    <input
                      className={fieldClass}
                      maxLength={100}
                      value={form.sku}
                      onChange={(e) =>
                        setForm({ ...form, sku: e.target.value })
                      }
                      placeholder="CAL-AT-001"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Available stock
                    <input
                      className={fieldClass}
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.stock_quantity}
                      onChange={(e) =>
                        setForm({ ...form, stock_quantity: e.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium md:col-span-2">
                    Short description
                    <input
                      className={fieldClass}
                      maxLength={300}
                      value={form.short_description}
                      onChange={(e) =>
                        setForm({ ...form, short_description: e.target.value })
                      }
                      placeholder="A compact flour mill designed for Indian kitchens."
                    />
                  </label>
                  <label className="block text-sm font-medium md:col-span-2">
                    Full description
                    <textarea
                      className={fieldClass}
                      rows={4}
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="Describe features, materials, usage and included accessories."
                    />
                  </label>
                </div>
              </section>

              <section className="border-t border-stone-100 pt-6">
                <h3 className="mb-4 text-base font-bold">Product dimensions</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-medium">
                    Height (cm)
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      value={form.height}
                      onChange={(e) =>
                        setForm({ ...form, height: e.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Width (cm)
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      value={form.width}
                      onChange={(e) =>
                        setForm({ ...form, width: e.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Depth (cm)
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      value={form.depth}
                      onChange={(e) =>
                        setForm({ ...form, depth: e.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  Sample dimensions are prefilled for convenience. Confirm
                  actual dimensions for each model before publishing.
                </p>
              </section>

              <section className="border-t border-stone-100 pt-6">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold">
                      Product image gallery
                    </h3>
                    <p className="mt-1 text-sm text-stone-500">
                      Add up to {MAX_IMAGES} images. Set the main photo and use
                      arrows to change gallery order.
                    </p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    {gallery.length} / {MAX_IMAGES} images
                  </span>
                </div>

                <div
                  onDragEnter={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setIsDragging(true);
                  }}
                  onDragLeave={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                      )
                    )
                      setIsDragging(false);
                  }}
                  onDrop={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    setIsDragging(false);
                    chooseImages(event.dataTransfer.files);
                  }}
                  className={`rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-8 ${isDragging ? "border-red-600 bg-red-50" : "border-stone-300 bg-stone-50 hover:border-red-400 hover:bg-red-50/30"}`}
                >
                  <label className="flex cursor-pointer flex-col items-center justify-center">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isDragging ? "bg-red-100 text-red-700" : "bg-white text-red-700 shadow-sm"}`}
                    >
                      <Upload size={23} />
                    </span>
                    <span className="mt-3 text-sm font-bold">
                      {isDragging
                        ? "Drop images to add them"
                        : "Drag and drop product images here"}
                    </span>
                    <span className="mt-1 text-xs text-stone-500">
                      or click to browse · JPG, PNG, WebP or AVIF · up to 8 MB
                      each
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      disabled={busy || gallery.length >= MAX_IMAGES}
                      className="sr-only"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        if (event.target.files)
                          chooseImages(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {gallery.length > 0 ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {gallery.map((item, index) => {
                      const src =
                        item.kind === "new"
                          ? item.previewUrl
                          : mediaUrl(item.image.storage_path);
                      const isPrimary = primaryKey === item.key;
                      const alt =
                        item.kind === "new"
                          ? item.file.name
                          : (item.image.alt_text ?? form.name);
                      return (
                        <article
                          key={item.key}
                          className={`overflow-hidden rounded-2xl border bg-white ${isPrimary ? "border-red-500 ring-2 ring-red-100" : "border-stone-200"}`}
                        >
                          <div className="relative flex h-44 items-center justify-center bg-stone-50 p-3">
                            {/* Blob previews are local; saved images come from the public Supabase Storage bucket. */}
                            <img
                              src={src}
                              alt={alt}
                              className="h-full w-full object-contain"
                            />
                            {isPrimary && (
                              <span className="absolute left-3 top-3 rounded-full bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white">
                                Main image
                              </span>
                            )}
                            {item.kind === "new" && (
                              <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-stone-700 shadow">
                                New
                              </span>
                            )}
                          </div>
                          <div className="space-y-3 p-3">
                            <p
                              className="truncate text-xs font-semibold text-stone-700"
                              title={item.kind === "new" ? item.file.name : alt}
                            >
                              {index + 1}.{" "}
                              {item.kind === "new"
                                ? item.file.name
                                : alt || "Product image"}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                title="Move image up"
                                aria-label="Move image up"
                                disabled={busy || index === 0}
                                onClick={() => moveGalleryItem(item.key, -1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                              >
                                <ArrowUp size={15} />
                              </button>
                              <button
                                type="button"
                                title="Move image down"
                                aria-label="Move image down"
                                disabled={busy || index === gallery.length - 1}
                                onClick={() => moveGalleryItem(item.key, 1)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                              >
                                <ArrowDown size={15} />
                              </button>
                              <button
                                type="button"
                                disabled={busy || isPrimary}
                                onClick={() => setPrimaryKey(item.key)}
                                className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-2 text-xs font-semibold hover:border-red-300 hover:text-red-700 disabled:bg-red-50 disabled:text-red-700"
                              >
                                {isPrimary ? "Main photo" : "Set as main"}
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeGalleryItem(item.key)}
                              className="w-full rounded-lg px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Remove image
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5 text-center">
                    <ImagePlus size={25} className="mx-auto text-stone-300" />
                    <p className="mt-2 text-sm font-semibold text-stone-700">
                      No product images added
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Choose at least one clear product photo before saving.
                    </p>
                  </div>
                )}
              </section>

              <section className="border-t border-stone-100 pt-6">
                <h3 className="mb-4 text-base font-bold">Store visibility</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Toggle
                    title="Publish product"
                    detail="Make it visible to customers"
                    checked={form.is_active}
                    onChange={(value) => setForm({ ...form, is_active: value })}
                  />
                  <Toggle
                    title="Featured product"
                    detail="Highlight it in featured sections"
                    checked={form.is_featured}
                    onChange={(value) =>
                      setForm({ ...form, is_featured: value })
                    }
                  />
                  <Toggle
                    title="Personalisation"
                    detail="Allow custom artwork for this product"
                    checked={form.is_customisable}
                    onChange={(value) =>
                      setForm({ ...form, is_customisable: value })
                    }
                  />
                </div>
              </section>

              <div className="flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-5">
                <button
                  type="button"
                  onClick={closeProductForm}
                  disabled={busy}
                  className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {busy
                    ? "Saving product…"
                    : editing
                      ? "Save product changes"
                      : "Create product"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 p-5">
            <div>
              <h2 className="text-lg font-bold">Product catalogue</h2>
              <p className="mt-1 text-sm text-stone-500">
                {visibleProducts.length} product
                {visibleProducts.length === 1 ? "" : "s"} shown
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2.5 focus-within:border-red-700">
                <Search size={16} className="text-stone-400" />
                <input
                  className="w-44 text-sm outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  className="accent-red-700"
                />{" "}
                Published only
              </label>
            </div>
          </div>

          {visibleProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={32} className="mx-auto text-stone-300" />
              <h3 className="mt-3 font-semibold text-stone-800">
                No products found
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                Add your first atta chakki product to start building the
                catalogue.
              </p>
              <button
                onClick={openNewProduct}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              >
                <Plus size={15} /> Add first product
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-5 py-4">Product</th>
                    <th className="px-4 py-4">Price</th>
                    <th className="px-4 py-4">Inventory</th>
                    <th className="px-4 py-4">Category</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {visibleProducts.map((product) => {
                    const primary = sortedImages(
                      product.product_images ?? [],
                    )[0];
                    return (
                      <tr key={product.id} className="hover:bg-stone-50/70">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {primary ? (
                              <Image
                                src={mediaUrl(primary.storage_path)}
                                alt={primary.alt_text ?? product.name}
                                width={56}
                                height={56}
                                className="h-14 w-14 rounded-xl border border-stone-200 bg-white object-contain"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-stone-100 text-stone-400">
                                <ImagePlus size={20} />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-stone-900">
                                {product.name}
                              </p>
                              <p className="mt-1 text-xs text-stone-500">
                                {product.sku || "No SKU assigned"}
                              </p>
                              <p className="mt-1 text-[11px] text-stone-500">
                                {product.product_images?.length ?? 0} gallery
                                image
                                {product.product_images?.length === 1
                                  ? ""
                                  : "s"}
                              </p>
                              {product.is_customisable && (
                                <p className="mt-1 text-[11px] font-medium text-red-700">
                                  Personalisation enabled
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-semibold">
                          {money(Number(product.price))}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={
                              product.stock_quantity === 0
                                ? "font-semibold text-red-700"
                                : product.stock_quantity <= 5
                                  ? "font-semibold text-amber-700"
                                  : "text-stone-700"
                            }
                          >
                            {product.stock_quantity} in stock
                          </span>
                        </td>
                        <td className="px-4 py-4 text-stone-600">
                          {product.categories?.name ?? "Uncategorised"}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}
                          >
                            {product.is_active
                              ? "Published"
                              : "Draft / archived"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditProduct(product)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-white"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void togglePublished(product)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-white disabled:opacity-50"
                            >
                              <Archive size={13} />{" "}
                              {product.is_active ? "Archive" : "Publish"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">{title}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{detail}</p>
    </div>
  );
}

function Toggle({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-4 transition hover:border-stone-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 accent-red-700"
      />
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {detail}
        </span>
      </span>
    </label>
  );
}
