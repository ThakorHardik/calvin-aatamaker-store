"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";

export type CategoryWithCount = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_path?: string | null;
  sort_order: number;
  product_count: number;
  image_url: string;
  show_on_homepage?: boolean;
};

interface HomepageCategoryShowcaseProps {
  categories: CategoryWithCount[];
  content?: Record<string, unknown>;
}

export default function HomepageCategoryShowcase({
  categories,
  content,
}: HomepageCategoryShowcaseProps) {
  // Only display categories configured for homepage
  const activeCategories = categories.filter(
    (c) => c.show_on_homepage !== false
  );

  // If there are no published categories, handle gracefully without breaking
  if (activeCategories.length === 0) {
    return null;
  }

  const heading =
    typeof content?.headline === "string" && content.headline.trim().length > 0
      ? content.headline
      : "Shop by Category";

  const subheading =
    typeof content?.subtitle === "string" && content.subtitle.trim().length > 0
      ? content.subtitle
      : "Explore the CALVIN collection, designed around your everyday needs.";

  return (
    <section
      id="homepage-category-showcase"
      data-section="category_showcase"
      className="relative z-10 border-b border-[#EAE3D8] bg-[#FAF7F2] px-5 py-14 sm:py-16 lg:py-20"
      aria-labelledby="categories-heading"
    >
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#BD2031]">
              <span className="h-px w-7 bg-[#BD2031]" />
              COLLECTIONS & RANGES
            </div>

            <h2
              id="categories-heading"
              className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] text-[#141211] sm:text-4xl lg:text-5xl"
            >
              {heading}
            </h2>

            <p className="mt-2.5 max-w-xl text-xs leading-relaxed text-[#5E5854] sm:text-sm">
              {subheading}
            </p>
          </div>

          <div className="sm:pb-1">
            <Link
              href="/products"
              className="group inline-flex items-center gap-2 text-xs font-semibold text-[#141211] transition-colors hover:text-[#BD2031] sm:text-sm"
            >
              <span>View all machines</span>
              <ArrowRight
                size={16}
                className="text-[#8A827D] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#BD2031]"
              />
            </Link>
          </div>
        </div>

        {/* Category Cards Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3.5 sm:mt-10 sm:gap-6 lg:grid-cols-4">
          {activeCategories.map((category) => {
            const countText =
              category.product_count === 1
                ? "1 Model"
                : `${category.product_count} Models`;

            return (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#EAE3D8] bg-white shadow-[0_2px_6px_rgba(20,18,17,0.03)] transition-all duration-300 hover:border-[#D9B88F] hover:shadow-[0_12px_28px_rgba(20,18,17,0.08)]"
              >
                {/* Image Stage */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FAF8F5]">
                  <Image
                    src={category.image_url}
                    alt={`${category.name} collection`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-contain p-4 sm:p-5 transition-transform duration-500 ease-out group-hover:scale-106"
                  />

                  {/* Product Count Pill Badge */}
                  <div className="absolute left-3 top-3 z-10">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-[#141211]/85 px-2.5 py-1 text-[10px] font-semibold text-[#FAF7F2] shadow-xs backdrop-blur-xs">
                      <Package size={11} className="text-[#D9B88F]" />
                      <span>{countText}</span>
                    </span>
                  </div>

                  {/* Hover Corner Arrow */}
                  <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#EAE3D8] bg-white text-[#141211] shadow-xs transition-all duration-200 group-hover:border-[#BD2031] group-hover:bg-[#BD2031] group-hover:text-white sm:h-9 sm:w-9">
                    <ArrowUpRight size={15} />
                  </span>
                </div>

                {/* Card Text Content */}
                <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#141211] transition-colors group-hover:text-[#BD2031] sm:text-base">
                      {category.name}
                    </h3>

                    {category.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#5E5854] sm:text-xs">
                        {category.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-3.5 flex items-center justify-between border-t border-[#F5EFE6] pt-2.5 text-[11px] font-medium text-[#8A827D] group-hover:text-[#BD2031]">
                    <span>Explore range</span>
                    <ArrowRight
                      size={12}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
