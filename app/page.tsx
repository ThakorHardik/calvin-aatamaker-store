"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import HomepageHero from "@/components/homepage-hero";
import HomepageTrustStrip from "@/components/homepage-trust-strip";
import HomepageProductCollection from "@/components/homepage-product-collection";
import HomepageHowItWorks from "@/components/homepage-how-it-works";
import StorefrontFooter from "@/components/storefront-footer";
import HomepageWhyCalvin from "@/components/homepage-why-calvin";
import HomepageContact from "@/components/homepage-contact";
import HomepageFaq from "@/components/homepage-faq";

import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/lib/mock-data";

type DbProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  price: number | string;
  stock_quantity: number;
  dimensions_cm: Record<string, string | number | null> | null;
  is_customisable: boolean;
  is_featured: boolean;
  is_active: boolean;
  categories: { name: string } | { name: string }[] | null;
  product_images: {
    storage_path: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }[] | null;
};

type CartItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  variantId: string | null;
  variantName: string | null;
  sku: string | null;
};

const CART_KEY = "calvin-aatamaker-cart";
const FALLBACK_IMAGE = "/images/compact-atta-chakki.jpeg";

function getImageUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
}

function formatDimension(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return /cm$/i.test(text) ? text : text + " cm";
}

function mapProduct(row: DbProduct): Product {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const images = [...(row.product_images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  const dimensions = row.dimensions_cm ?? {};

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: category?.name ?? "Aatamakers",
    description:
      row.short_description?.trim() ||
      row.description?.trim() ||
      "Explore product details and specifications.",
    price: Number(row.price),
    image: images[0]?.storage_path
      ? getImageUrl(images[0].storage_path)
      : FALLBACK_IMAGE,
    dimensions: {
      height: formatDimension(dimensions.height),
      width: formatDimension(dimensions.width),
      depth: formatDimension(dimensions.depth),
    },
    badge: row.is_featured ? "Featured model" : category?.name ?? "The collection",
    customisable: row.is_customisable,
    active: row.is_active,
    stock: Number(row.stock_quantity) || 0,
  };
}

function readCart(): CartItem[] {
  try {
    const saved = window.localStorage.getItem(CART_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState("");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All products");
  const [toast, setToast] = useState("");

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductError("");

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,name,slug,sku,short_description,description,price,stock_quantity,dimensions_cm,is_customisable,is_featured,is_active,categories(name),product_images(storage_path,alt_text,is_primary,sort_order)",
      )
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(4);

    if (error) {
      console.error("Homepage product query failed:", error.message);
      setProductError(
        "We couldn't load the collection right now. Please refresh the page.",
      );
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setProducts(((data ?? []) as unknown as DbProduct[]).map(mapProduct));
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const searchableText =
        (product.name + " " + product.category + " " + product.description).toLowerCase();
      const matchesQuery = searchableText.includes(normalizedQuery);
      const matchesFilter =
        activeFilter === "All products" ||
        (activeFilter === "Customisable" && product.customisable);

      return matchesQuery && matchesFilter;
    });
  }, [products, query, activeFilter]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function addToCart(product: Product) {
    if (product.stock < 1) {
      showToast("This product is currently out of stock.");
      return;
    }

    try {
      const cart = readCart();
      const itemId = product.id + ":default";
      const existingIndex = cart.findIndex((item) => item.id === itemId);
      const currentQuantity =
        existingIndex >= 0 ? Number(cart[existingIndex].quantity) || 0 : 0;

      if (currentQuantity + 1 > product.stock) {
        showToast("You have added all currently available units.");
        return;
      }

      const nextItem: CartItem = {
        id: itemId,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        unitPrice: product.price,
        quantity: currentQuantity + 1,
        variantId: null,
        variantName: null,
        sku: null,
      };

      if (existingIndex >= 0) {
        cart[existingIndex] = nextItem;
      } else {
        cart.push(nextItem);
      }

      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
      window.dispatchEvent(new Event("calvin-cart-updated"));
      showToast(product.name + " added to your cart.");
    } catch (error) {
      console.error("Could not save homepage cart item:", error);
      showToast("We couldn't update your cart. Please try again.");
    }
  }

  return (
    <main id="top">
      <StorefrontHeader
        searchValue={query}
        onSearchValueChange={setQuery}
        onSearchSubmit={() => {
          document.querySelector("#shop")?.scrollIntoView({
            behavior: "smooth",
          });
        }}
      />

      <HomepageHero />
      <HomepageTrustStrip />

      <HomepageProductCollection
        products={visibleProducts}
        query={query}
        setQuery={setQuery}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        addToCart={addToCart}
        showToast={showToast}
        loading={loadingProducts}
        error={productError}
      />

      <HomepageWhyCalvin />
      <HomepageHowItWorks />
      <HomepageFaq />
      <HomepageContact />
      <StorefrontFooter />

      {toast && (
        <div className="toast-message" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}

      <a
        className="back-to-top"
        href="#top"
        aria-label="Back to top"
        onClick={(event) => {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <ArrowRight size={17} />
      </a>
    </main>
  );
}
