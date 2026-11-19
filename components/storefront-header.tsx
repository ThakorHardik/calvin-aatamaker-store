"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Menu, Search, ShoppingBag, User, Wheat, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const controlledSearch =
    typeof searchValue === "string" && Boolean(onSearchValueChange);

  const currentSearch = controlledSearch ? searchValue! : localSearch;

  const displayedCartCount = cartCount ?? storedCartCount;
  const homePrefix = pathname === "/" ? "" : "/";

  const [announcement, setAnnouncement] = useState({
    enabled: true,
    text: "Free Doorstep Delivery Across India · 5-Year Domestic Motor Warranty",
    link: "/products",
  });
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [customNavLinks, setCustomNavLinks] = useState<Array<{ id: string; label: string; href: string; isExternal?: boolean }> | null>(null);

  useEffect(() => {
    function loadCMS() {
      try {
        const rawSettings = localStorage.getItem("calvin-store-settings");
        if (rawSettings) {
          const s = JSON.parse(rawSettings);
          setAnnouncement({
            enabled: s.announcementEnabled !== false,
            text: s.announcementText || "Free Doorstep Delivery Across India · 5-Year Domestic Motor Warranty",
            link: s.announcementLink || "/products",
          });
          setIsAcceptingOrders(s.isAcceptingOrders !== false);
          setMaintenanceMessage(s.maintenanceMessage || "");
        }

        const rawNav = localStorage.getItem("calvin-nav-menus");
        if (rawNav) {
          const n = JSON.parse(rawNav);
          if (Array.isArray(n.headerLinks) && n.headerLinks.length > 0) {
            setCustomNavLinks(n.headerLinks);
          }
        }
      } catch {
        // Fallback to default
      }
    }

    loadCMS();
    window.addEventListener("storage", loadCMS);
    window.addEventListener("calvin-settings-updated", loadCMS);
    window.addEventListener("calvin-nav-updated", loadCMS);

    return () => {
      window.removeEventListener("storage", loadCMS);
      window.removeEventListener("calvin-settings-updated", loadCMS);
      window.removeEventListener("calvin-nav-updated", loadCMS);
    };
  }, []);

  // Check customer session state
  useEffect(() => {
    let isMounted = true;
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (isMounted) {
          setIsAuthenticated(Boolean(session?.user));
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (isMounted) {
          setIsAuthenticated(Boolean(session?.user));
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch {
      if (isMounted) {
        setIsAuthenticated(false);
      }
    }
  }, []);

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

  function isLinkActive(href: string): boolean {
    if (!href) return false;
    if (href === "/pages/contact") {
      return pathname.startsWith("/pages/contact");
    }
    if (href === "/account") {
      return pathname.startsWith("/account");
    }
    if (href === "/login") {
      return pathname.startsWith("/login");
    }
    if (href === "/cart") {
      return pathname.startsWith("/cart");
    }
    if (href.endsWith("#shop") && (pathname === "/products" || pathname.startsWith("/products/"))) {
      return true;
    }
    if (href === "/products" && (pathname === "/products" || pathname.startsWith("/products/"))) {
      return true;
    }
    if (href === "/" && pathname === "/") {
      return true;
    }
    return pathname === href;
  }

  return (
    <>
      {announcement.enabled && (
        <div className="announcement-bar">
          <span className="announcement-mark">
            <Wheat size={14} />
          </span>

          <Link href={announcement.link || "/products"} className="hover:underline">
            {announcement.text}
          </Link>

          <span className="announcement-right">
            CALVIN AATAMAKER <span className="announcement-dot">•</span> MADE FOR HOME
          </span>
        </div>
      )}

      {!isAcceptingOrders && (
        <div className="bg-amber-500 text-stone-950 font-bold px-4 py-2 text-center text-xs tracking-wide">
          ⚠️ NOTICE: {maintenanceMessage || "Storefront is temporarily not accepting orders. Please check back shortly."}
        </div>
      )}

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
            width={140}
            height={60}
            priority
            className="h-[38px] sm:h-[42px] w-auto max-w-[142px] object-contain"
          />
        </Link>

        <nav
          id="storefront-main-navigation"
          className={`main-nav ${mobileMenuOpen ? "main-nav-open" : ""}`}
          aria-label="Main navigation"
        >
          {customNavLinks && customNavLinks.length > 0 ? (
            customNavLinks.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className={isLinkActive(link.href) ? "nav-link-active" : undefined}
                target={link.isExternal ? "_blank" : undefined}
                rel={link.isExternal ? "noopener noreferrer" : undefined}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))
          ) : (
            <>
              <Link
                href={`${homePrefix}#shop`}
                className={isLinkActive(`${homePrefix}#shop`) ? "nav-link-active" : undefined}
                onClick={closeMenu}
              >
                Shop Aatamakers
              </Link>

              <Link
                href={`${homePrefix}#why-calvin`}
                className={isLinkActive(`${homePrefix}#why-calvin`) ? "nav-link-active" : undefined}
                onClick={closeMenu}
              >
                Why Calvin
              </Link>

              <Link
                href={`${homePrefix}#personalise`}
                className={isLinkActive(`${homePrefix}#personalise`) ? "nav-link-active" : undefined}
                onClick={closeMenu}
              >
                Personalise
              </Link>

              <Link
                href="/pages/contact"
                className={isLinkActive("/pages/contact") ? "nav-link-active" : undefined}
                onClick={closeMenu}
              >
                Help &amp; support
              </Link>
            </>
          )}

          <Link
            href={isAuthenticated ? "/account" : "/login"}
            className={isLinkActive(isAuthenticated ? "/account" : "/login") ? "nav-link-active" : undefined}
            onClick={closeMenu}
          >
            {isAuthenticated ? "My Account" : "Sign In"}
          </Link>
        </nav>

        <div className="header-actions">
          <Link
            href={isAuthenticated ? "/account" : "/login"}
            className="icon-button"
            aria-label={
              isAuthenticated ? "Open my account" : "Customer sign in"
            }
            title={isAuthenticated ? "My Account" : "Sign In"}
          >
            <User size={19} />
          </Link>

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
