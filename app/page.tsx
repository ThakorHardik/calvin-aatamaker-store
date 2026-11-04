import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

import StorefrontHeader from "@/components/storefront-header";
import HomepageHero from "@/components/homepage-hero";
import HomepageTrustStrip from "@/components/homepage-trust-strip";
import HomepageProductCollection, {
  type RealProduct,
  type RealCategory,
} from "@/components/homepage-product-collection";
import HomepageWhyCalvin from "@/components/homepage-why-calvin";
import HomepageHowItWorks from "@/components/homepage-how-it-works";
import HomepageFaq from "@/components/homepage-faq";
import HomepageContact from "@/components/homepage-contact";
import StorefrontFooter from "@/components/storefront-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calvin Aatamaker | Fresh flour, made at home",
  description:
    "Explore compact, stone-ground domestic aatamakers by Calvin. Thoughtful design, natural nutrition, and personalised flour milling for Indian kitchens.",
  openGraph: {
    title: "Calvin Aatamaker | Fresh flour, made at home",
    description:
      "Explore compact, stone-ground domestic aatamakers by Calvin. Thoughtful design, natural nutrition, and personalised flour milling for Indian kitchens.",
    type: "website",
    locale: "en_IN",
  },
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
  categories: { id?: string; name?: string; slug?: string } | null;
  product_images: Array<{
    id: string;
    storage_path: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }> | null;
};

type SectionConfigItem = {
  key: string;
  isEnabled: boolean;
  sortOrder: number;
  content?: Record<string, unknown>;
};

const DEFAULT_SECTION_ORDER: SectionConfigItem[] = [
  { key: "hero_carousel", isEnabled: true, sortOrder: 1 },
  { key: "trust_strip", isEnabled: true, sortOrder: 2 },
  { key: "category_showcase", isEnabled: true, sortOrder: 3 },
  { key: "featured_products", isEnabled: true, sortOrder: 4 },
  { key: "why_calvin", isEnabled: true, sortOrder: 5 },
  { key: "how_it_works", isEnabled: true, sortOrder: 6 },
  { key: "faq", isEnabled: true, sortOrder: 7 },
  { key: "newsletter", isEnabled: true, sortOrder: 8 },
];

function getProductImageUrl(
  storagePath: string | null | undefined,
  supabaseUrl: string
): string {
  if (!storagePath) return "/images/calvin-aatamaker-logo.png";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;

  const clean = storagePath
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/product-media\//, "")
    .replace(/^product-media\//, "");

  return `${supabaseUrl}/storage/v1/object/public/product-media/${clean}`;
}

export default async function HomePage() {
  const supabase = await createClient();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://jxveftfkpmzevjimxzce.supabase.co";

  // 1. Fetch active categories
  const { data: rawCategories } = await supabase
    .from("categories")
    .select("id, name, slug, image_path, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const categories: RealCategory[] = (rawCategories ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    image_path: cat.image_path,
  }));

  // 2. Fetch active products with categories and images
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
      categories (id, name, slug),
      product_images (id, storage_path, alt_text, is_primary, sort_order)
    `
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const products: RealProduct[] = (
    (rawProducts ?? []) as unknown as SupabaseProductRow[]
  ).map((p) => {
    // Sort images: primary first, then by sort_order
    const sortedImages = [...(p.product_images ?? [])].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    const primaryStoragePath = sortedImages[0]?.storage_path;
    const imageUrl = getProductImageUrl(primaryStoragePath, supabaseUrl);

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
      category_name: p.categories?.name,
      category_slug: p.categories?.slug,
      category_id: p.category_id,
      image: imageUrl,
    };
  });

  // 3. Fetch CMS Section Configuration
  let dynamicSections: SectionConfigItem[] = DEFAULT_SECTION_ORDER;
  try {
    const { data: cmsSetting } = await supabase
      .from("store_settings")
      .select("value, setting_value")
      .eq("setting_key", "homepage_sections_config")
      .maybeSingle();

    if (cmsSetting) {
      const val = cmsSetting.value || cmsSetting.setting_value;
      if (Array.isArray(val) && val.length > 0) {
        dynamicSections = (val as Array<Record<string, unknown>>).map((s, idx) => ({
          key: String(s.key || s.section_key || ""),
          isEnabled: s.isEnabled !== false && s.is_enabled !== false,
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : typeof s.sort_order === "number" ? s.sort_order : idx + 1,
          content: typeof s.content === "object" && s.content !== null ? (s.content as Record<string, unknown>) : undefined,
        }));
      }
    } else {
      // Fallback check to homepage_sections table
      const { data: tableSections } = await supabase
        .from("homepage_sections")
        .select("section_key, is_enabled, sort_order, content")
        .order("sort_order", { ascending: true });

      if (tableSections && tableSections.length > 0) {
        dynamicSections = tableSections.map((s, idx) => ({
          key: s.section_key,
          isEnabled: Boolean(s.is_enabled),
          sortOrder: s.sort_order ?? idx + 1,
          content: typeof s.content === "object" && s.content !== null ? (s.content as Record<string, unknown>) : undefined,
        }));
      }
    }
  } catch {
    // Retain default section order on network or table absence
  }

  // Sort sections and filter out disabled ones
  const activeSections = dynamicSections
    .filter((sec) => sec.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <main id="top" className="min-h-screen bg-[var(--paper)] text-stone-900">
      {/* 1. Shared Header */}
      <StorefrontHeader />

      {/* 2. Dynamically Rendered Homepage CMS Sections */}
      {activeSections.map((section) => {
        switch (section.key) {
          case "hero_carousel":
            return <HomepageHero key="hero_carousel" />;

          case "trust_strip":
            return (
              <HomepageTrustStrip
                key="trust_strip"
                content={section.content}
              />
            );

          case "category_showcase":
            return categories.length > 0 ? (
              <section
                key="category_showcase"
                className="border-b border-stone-200 bg-[#faf6f0] py-8 sm:py-10"
              >
                <div className="mx-auto max-w-7xl px-5 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b91f32]">
                        Explore by Category
                      </span>
                      <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-stone-900">
                        Flour Mill Collections
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        href="/products"
                        className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-[#b91f32] hover:text-[#b91f32]"
                      >
                        <Layers size={13} />
                        <span>All Categories</span>
                      </Link>

                      {categories.map((cat) => (
                        <Link
                          key={cat.id}
                          href={`/products?category=${encodeURIComponent(
                            cat.slug || cat.id
                          )}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-[#b91f32] hover:text-[#b91f32]"
                        >
                          <span>{cat.name}</span>
                          <ArrowRight size={12} className="text-stone-400" />
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null;

          case "featured_products":
            return (
              <HomepageProductCollection
                key="featured_products"
                products={products}
                categories={categories}
              />
            );

          case "why_calvin":
            return (
              <HomepageWhyCalvin
                key="why_calvin"
                content={section.content}
              />
            );

          case "how_it_works":
            return (
              <HomepageHowItWorks
                key="how_it_works"
                content={section.content}
              />
            );

          case "faq":
            return (
              <HomepageFaq
                key="faq"
                content={section.content}
              />
            );

          case "newsletter":
            return <HomepageContact key="newsletter" />;

          default:
            return null;
        }
      })}

      {/* 3. Shared Footer */}
      <StorefrontFooter />
    </main>
  );
}
