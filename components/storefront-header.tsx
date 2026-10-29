"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Menu, Search, ShoppingBag, Wheat, X } from "lucide-react";

type StorefrontHeaderProps = {
  cartCount?: number;
  onOpenCart?: () => void;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  onSearchSubmit?: () => void;
};

const CART_KEY = "calvin-aatamaker-cart";

type StoredCartItem = {
  quantity?: unknown;
};

export default function StorefrontHeader({
  cartCount,
  onOpenCart,
  searchValue,
  onSearchValueChange,
  onSearchSubmit,
}: StorefrontHeaderProps) {
  const pathname = usePathname();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [storedCartCount, setStoredCartCount] = useState(0);

  const controlledSearch =
    typeof searchValue === "string" && Boolean(onSearchValueChange);

  const currentSearch = controlledSearch ? searchValue! : localSearch;

  const displayedCartCount = cartCount ?? storedCartCount;
  const homePrefix = pathname === "/" ? "" : "/";

  // Read a search query when the visitor opens the catalogue.
  useEffect(() => {
    if (pathname !== "/products") {
      if (!controlledSearch) {
        setLocalSearch("");
      }
      return;
    }

    if (!controlledSearch) {
      setLocalSearch(
        new URLSearchParams(window.location.search).get("search") ?? "",
      );
    }
  }, [pathname, controlledSearch]);

  // Close the mobile menu with Escape and prevent background scrolling.
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  // Read cart quantity from the existing localStorage cart.
  useEffect(() => {
    if (cartCount !== undefined || onOpenCart) return;

    const updateCount = () => {
      try {
        const raw = window.localStorage.getItem(CART_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];

        if (!Array.isArray(parsed)) {
          setStoredCartCount(0);
          return;
        }

        const total = (parsed as StoredCartItem[]).reduce((sum, item) => {
          const quantity = Number(item?.quantity ?? 0);

          return (
            sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0)
          );
        }, 0);

        setStoredCartCount(total);
      } catch {
        setStoredCartCount(0);
      }
    };

    updateCount();

    window.addEventListener("storage", updateCount);
    window.addEventListener("calvin-cart-updated", updateCount);

    return () => {
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("calvin-cart-updated", updateCount);
    };
  }, [cartCount, onOpenCart]);

  function closeMenu() {
    setMobileMenuOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSearchOpen(false);
    closeMenu();

    if (onSearchSubmit) {
      onSearchSubmit();
      return;
    }

    const value = currentSearch.trim();

    if (value) {
      window.location.assign(`/products?search=${encodeURIComponent(value)}`);
    } else if (pathname !== "/products") {
      window.location.assign("/products");
    }
  }

  return (
    <>
      <div className="announcement-bar">
        <span className="announcement-mark">
          <Wheat size={14} />
        </span>

        <span>
          A better way to bring fresh flour into your everyday kitchen
        </span>

        <span className="announcement-right">
          CALVIN AATAMAKER <span className="announcement-dot">•</span> MADE FOR
          HOME
        </span>
      </div>

      <header className="site-header">
        <Link
          className="brand-lockup"
          href="/"
          aria-label="Calvin Aatamaker home"
          onClick={closeMenu}
        >
          <Image
            src="/images/calvin-aatamaker-logo.png"
            alt="Calvin Aatamaker logo"
            width={168}
            height={74}
            priority
          />
        </Link>

        <nav
          id="storefront-main-navigation"
          className={`main-nav ${mobileMenuOpen ? "main-nav-open" : ""}`}
          aria-label="Main navigation"
        >
          <Link href={`${homePrefix}#shop`} onClick={closeMenu}>
            Shop Aatamakers
          </Link>

          <Link href={`${homePrefix}#why-calvin`} onClick={closeMenu}>
            Why Calvin
          </Link>

          <Link href={`${homePrefix}#personalise`} onClick={closeMenu}>
            Personalise
          </Link>

          <Link href={`${homePrefix}#help`} onClick={closeMenu}>
            Help &amp; support
          </Link>
        </nav>

        <div className="header-actions">
          <button
            className="icon-button search-toggle"
            aria-label={searchOpen ? "Close product search" : "Search products"}
            aria-expanded={searchOpen}
            onClick={() => {
              setMobileMenuOpen(false);
              setSearchOpen((value) => !value);
            }}
            type="button"
          >
            {searchOpen ? <X size={20} /> : <Search size={20} />}
          </button>

          {onOpenCart ? (
            <button
              className="cart-button"
              onClick={onOpenCart}
              aria-label={`Open cart, ${displayedCartCount} items`}
              type="button"
            >
              <ShoppingBag size={18} />
              <span className="cart-button-label">Cart</span>
              <span className="cart-count">{displayedCartCount}</span>
            </button>
          ) : (
            <Link
              className="cart-button"
              href="/cart"
              aria-label={`Open cart, ${displayedCartCount} items`}
            >
              <ShoppingBag size={18} />
              <span className="cart-button-label">Cart</span>
              <span className="cart-count">{displayedCartCount}</span>
            </Link>
          )}

          <button
            className="icon-button mobile-menu-toggle"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="storefront-main-navigation"
            onClick={() => {
              setSearchOpen(false);
              setMobileMenuOpen((value) => !value);
            }}
            type="button"
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>

        {searchOpen && (
          <form className="search-panel" onSubmit={submitSearch} role="search">
            <Search size={18} aria-hidden="true" />

            <input
              autoFocus
              value={currentSearch}
              onChange={(event) => {
                const value = event.target.value;

                if (controlledSearch) {
                  onSearchValueChange?.(value);
                } else {
                  setLocalSearch(value);
                }
              }}
              placeholder="Search aatamakers..."
              aria-label="Search products"
            />

            <button type="submit" className="search-submit">
              Search
            </button>
          </form>
        )}
      </header>

      {mobileMenuOpen && (
        <button
          className="mobile-menu-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
      )}
    </>
  );
}
