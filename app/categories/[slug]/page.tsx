import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Layers,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import CategoryProductGrid from "./category-product-grid";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

type SupabaseProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock_quantity: number | string;
  dimensions_cm: Record<string, string | number | null> | null;
  weight_kg: number | string | null;
  is_customisable: boolean;
  is_featured: boolean;
  sort_order: number;
  product_images: Array<{
    id: string;
    storage_path: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }> | null;
};

function getImageUrl(
  storagePath: string | null | undefined,
  supabaseUrl: string
): string {
  if (!storagePath) return "/images/compact-atta-chakki.jpeg";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;

  const clean = storagePath
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/product-media\//, "")
    .replace(/^product-media\//, "");

  return `${supabaseUrl}/storage/v1/object/public/product-media/${clean}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) {
    return {
      title: "Category Not Found | Calvin Aatamaker",
    };
  }

  return {
    title: `${category.name} | Calvin Aatamaker`,
    description:
      category.description ||
      `Explore our ${category.name} domestic flour mill collection. Engineered for Indian modular kitchens.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://jxveftfkpmzevjimxzce.supabase.co";

  // 1. Fetch current category
  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) {
    notFound();
  }

  // 2. Fetch all other active categories for sibling navigation
  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, name, slug, image_path, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // 3. Fetch products belonging to this category
  const { data: rawProducts } = await supabase
    .from("products")
    .select(
      `
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
      sort_order,
      product_images (id, storage_path, alt_text, is_primary, sort_order)
    `
    )
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const products = ((rawProducts ?? []) as unknown as SupabaseProductRow[]).map(
    (p) => {
      const sortedImages = [...(p.product_images ?? [])].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      const primaryStoragePath = sortedImages[0]?.storage_path;
      const imageUrl = getImageUrl(primaryStoragePath, supabaseUrl);

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        short_description: p.short_description,
        description: p.description || "",
        price: Number(p.price) || 0,
        compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
        stock_quantity: Number(p.stock_quantity) || 0,
        dimensions_cm: p.dimensions_cm || null,
        weight_kg: p.weight_kg ? Number(p.weight_kg) : null,
        is_customisable: Boolean(p.is_customisable),
        is_featured: Boolean(p.is_featured),
        category_name: category.name,
        category_slug: category.slug,
        category_id: category.id,
        image: imageUrl,
      };
    }
  );

  return (
    <main className="min-h-screen bg-[#FAF7F2] text-[#141211]">
      <StorefrontHeader />

      {/* Breadcrumbs Strip */}
      <nav
        aria-label="Breadcrumbs"
        className="border-b border-[#EAE3D8] bg-[#F7F3EC] py-3.5 px-5 sm:px-6"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs font-medium text-[#5E5854]">
          <Link href="/" className="transition-colors hover:text-[#141211]">
            Home
          </Link>
          <ChevronRight size={13} className="text-[#8A827D]" />
          <Link href="/products" className="transition-colors hover:text-[#141211]">
            Collections
          </Link>
          <ChevronRight size={13} className="text-[#8A827D]" />
          <span className="font-semibold text-[#141211]">{category.name}</span>
        </div>
      </nav>

      {/* Category Header Banner */}
      <section className="border-b border-[#EAE3D8] bg-white px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#BD2031]">
                <span className="h-px w-6 bg-[#BD2031]" />
                CALVIN CATEGORY
              </div>

              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#141211] sm:text-4xl lg:text-5xl">
                {category.name}
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#5E5854] sm:text-base">
                {category.description ||
                  "Thoughtfully engineered domestic flour mills designed around everyday Indian cooking. Natural stone milling and compact elegance."}
              </p>

              <div className="mt-5 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D9B88F] bg-[#FAF2E8] px-3 py-1 text-xs font-semibold text-[#8C6239]">
                  <Package size={13} className="text-[#D9B88F]" />
                  <span>
                    {products.length} {products.length === 1 ? "Model" : "Models"}{" "}
                    Available
                  </span>
                </span>

                <Link
                  href="/products"
                  className="text-xs font-semibold text-[#141211] underline underline-offset-4 hover:text-[#BD2031] transition-colors"
                >
                  View all collections
                </Link>
              </div>
            </div>

            {/* Sibling Category Quick Links */}
            {allCategories && allCategories.length > 1 && (
              <div className="rounded-2xl border border-[#EAE3D8] bg-[#FAF8F5] p-5 lg:justify-self-end w-full max-w-md">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A827D]">
                  Other Ranges
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allCategories
                    .filter((c) => c.slug !== category.slug)
                    .map((cat) => (
                      <Link
                        key={cat.id}
                        href={`/categories/${cat.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#DED6CB] bg-white px-3 py-1.5 text-xs font-semibold text-[#141211] shadow-2xs hover:border-[#BD2031] hover:text-[#BD2031] transition-colors"
                      >
                        <Layers size={12} className="text-[#8A827D]" />
                        <span>{cat.name}</span>
                      </Link>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Products Grid Section */}
      <section className="px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <CategoryProductGrid
            products={products}
            categoryName={category.name}
          />
        </div>
      </section>

      <StorefrontFooter />
    </main>
  );
}
