"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  ShoppingBag,
  Wheat,
  X,
} from "lucide-react";

import StorefrontHeader from "@/components/storefront-header";
import HomepageHero from "@/components/homepage-hero";
import HomepageTrustStrip from "@/components/homepage-trust-strip";
import HomepageProductCollection from "@/components/homepage-product-collection";
import HomepageHowItWorks from "@/components/homepage-how-it-works";
import StorefrontFooter from "@/components/storefront-footer";
import HomepageWhyCalvin from "@/components/homepage-why-calvin";

import HomepageContact from "@/components/homepage-contact";

import HomepageFaq from "@/components/homepage-faq";

import { formatINR, initialProducts, type Product } from "@/lib/mock-data";

type CartLine = {
  product: Product;
  quantity: number;
};

export default function HomePage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All products");
  const [toast, setToast] = useState("");

  const products = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialProducts.filter((product) => {
      const searchableText =
        `${product.name} ${product.category}`.toLowerCase();

      const matchesQuery = searchableText.includes(normalizedQuery);

      const matchesFilter =
        activeFilter === "All products" ||
        (activeFilter === "Customisable" && product.customisable);

      return product.active && matchesQuery && matchesFilter;
    });
  }, [query, activeFilter]);

  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);

  const cartSubtotal = cart.reduce(
    (total, line) => total + line.product.price * line.quantity,
    0,
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                quantity: line.quantity + 1,
              }
            : line,
        );
      }

      return [
        ...current,
        {
          product,
          quantity: 1,
        },
      ];
    });

    setCartOpen(true);
  }

  function updateQuantity(productId: string, amount: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? {
                ...line,
                quantity: line.quantity + amount,
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  return (
    <main id="top">
      {/* 1. Shared navigation */}
      <StorefrontHeader
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        searchValue={query}
        onSearchValueChange={setQuery}
        onSearchSubmit={() => {
          document.querySelector("#shop")?.scrollIntoView({
            behavior: "smooth",
          });
        }}
      />

      {/* 2. Dynamic homepage hero */}
      <HomepageHero />

      {/* 3. Trust highlights */}
      <HomepageTrustStrip />

      {/* 4. Product collection - separate component */}
      <HomepageProductCollection
        products={products}
        query={query}
        setQuery={setQuery}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        addToCart={addToCart}
        showToast={showToast}
      />

      <HomepageWhyCalvin />

      {/* 5. How it works */}
      <HomepageHowItWorks />

      <HomepageFaq />

      {/* Contact and support */}
      <HomepageContact />

      {/* 6. Contact section */}

      {/* 7. Shared footer */}
      <StorefrontFooter />

      {/* Homepage demonstration cart */}
      {cartOpen && (
        <div
          className="drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCartOpen(false);
            }
          }}
        >
          <aside className="cart-drawer" aria-label="Shopping cart">
            <div className="drawer-heading">
              <div>
                <span className="drawer-eyebrow">YOUR SELECTION</span>

                <h2>
                  Your cart <span>({cartCount})</span>
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                aria-label="Close cart"
                onClick={() => setCartOpen(false)}
              >
                <X size={21} />
              </button>
            </div>

            {cart.length > 0 ? (
              <>
                <div className="cart-lines">
                  {cart.map((line) => (
                    <div className="cart-line" key={line.product.id}>
                      <Image
                        src={line.product.image}
                        alt={line.product.name}
                        width={82}
                        height={102}
                      />

                      <div className="cart-line-info">
                        <strong>{line.product.name}</strong>

                        <span>{formatINR(line.product.price)}</span>

                        <div className="quantity-stepper">
                          <button
                            type="button"
                            aria-label="Reduce quantity"
                            onClick={() => updateQuantity(line.product.id, -1)}
                          >
                            <Minus size={13} />
                          </button>

                          <span>{line.quantity}</span>

                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => updateQuantity(line.product.id, 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>

                      <strong className="cart-line-total">
                        {formatINR(line.product.price * line.quantity)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="cart-footer">
                  <div className="cart-subtotal">
                    <span>Subtotal</span>
                    <strong>{formatINR(cartSubtotal)}</strong>
                  </div>

                  <p>Shipping and taxes are calculated at checkout.</p>

                  <button
                    type="button"
                    className="button button-primary checkout-button"
                    onClick={() =>
                      showToast(
                        "This is a homepage demo cart. Use the product page and Cart page for the current checkout flow.",
                      )
                    }
                  >
                    Continue to checkout
                    <ArrowRight size={17} />
                  </button>

                  <button
                    type="button"
                    className="continue-shopping"
                    onClick={() => setCartOpen(false)}
                  >
                    Continue shopping
                  </button>

                  <div className="cart-demo-warning">
                    Demo cart — items are separate from the Supabase-backed
                    cart.
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-cart">
                <span className="empty-cart-icon">
                  <ShoppingBag size={26} />
                </span>

                <h3>Your cart is taking a break.</h3>

                <p>Add your favourite Aatamaker to get started.</p>

                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setCartOpen(false);

                    document.querySelector("#shop")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  Explore the collection
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Temporary user feedback */}
      {toast && (
        <div className="toast-message" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}

      {/* Back-to-top control */}
      <a
        className="back-to-top"
        href="#top"
        aria-label="Back to top"
        onClick={(event) => {
          event.preventDefault();

          window.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }}
      >
        <ArrowRight size={17} />
      </a>
    </main>
  );
}
