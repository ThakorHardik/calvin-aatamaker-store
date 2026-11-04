"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  Images,
  Home,
  FileText,
  Menu,
  Palette,
  Settings,
  ExternalLink,
  ChevronRight,
  LogOut,
  X,
  Compass,
  Box,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AdminLayoutContext } from "./admin-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    title: "OVERVIEW",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "CATALOGUE & SALES",
    items: [
      {
        label: "Products & Variants",
        href: "/admin/products",
        icon: Package,
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: Layers,
      },
      {
        label: "Orders & Fulfilment",
        href: "/admin/orders",
        icon: ShoppingBag,
      },
      {
        label: "Media Library",
        href: "/admin/media",
        icon: Images,
      },
      {
        label: "3D Models & Studio",
        href: "/admin/models",
        icon: Box,
      },
    ],
  },
  {
    title: "STOREFRONT CMS",
    items: [
      {
        label: "Homepage Studio",
        href: "/admin/homepage",
        icon: Home,
      },
      {
        label: "Hero Banners",
        href: "/admin/banners",
        icon: Images,
      },
      {
        label: "Navigation & Menus",
        href: "/admin/navigation",
        icon: Compass,
      },
      {
        label: "Pages & SEO",
        href: "/admin/pages",
        icon: FileText,
      },
    ],
  },
  {
    title: "BRAND & SETTINGS",
    items: [
      {
        label: "Theme Customizer",
        href: "/admin/theme",
        icon: Palette,
      },
      {
        label: "Store Settings",
        href: "/admin/settings",
        icon: Settings,
      },
    ],
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Unauthenticated visitors on /admin see only the clean, centered login page.
  // Authenticated administrators or users on subroutes (/admin/*) see the complete layout.
  const isRootAdmin = pathname === "/admin";
  const showSidebar = !isRootAdmin || isAdminAuthenticated;

  const contextValue = useMemo(
    () => ({
      isAdminAuthenticated,
      setIsAdminAuthenticated,
    }),
    [isAdminAuthenticated],
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  }

  const renderNavLinks = () => (
    <div className="space-y-6">
      {navigationGroups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.16em] text-stone-500">
            {group.title}
          </p>

          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition font-medium ${
                    active
                      ? "bg-[#bf1e2e] text-white shadow-xs"
                      : "text-stone-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {Icon ? <Icon size={17} strokeWidth={1.8} className="shrink-0" /> : null}
                  <span className="truncate">{item.label}</span>

                  {active && <ChevronRight size={14} className="ml-auto text-white/80 shrink-0" />}
                  {item.badge && (
                    <span className="ml-auto rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <AdminLayoutContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#f7f7f5] flex flex-col md:flex-row">
        {showSidebar && (
          <>
            {/* Desktop Persistent Sidebar */}
            <aside className="hidden md:flex md:w-[270px] shrink-0 flex-col bg-[#1e1919] text-white md:sticky md:top-0 md:h-screen border-r border-white/5">
              {/* Brand Header */}
              <div className="border-b border-white/10 p-5">
                <Link href="/admin" className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#bf1e2e] text-lg font-black text-white shadow-sm">
                    C
                  </div>
                  <div>
                    <p className="text-sm font-bold tracking-wide text-white">
                      CALVIN AATAMAKER
                    </p>
                    <p className="text-[11px] text-stone-400">Admin Studio & CMS</p>
                  </div>
                </Link>
              </div>

              {/* Navigation Body */}
              <nav className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {renderNavLinks()}
              </nav>

              {/* Footer Links & Status */}
              <div className="border-t border-white/10 p-4 space-y-2">
                <Link
                  href="/"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs text-stone-300 hover:bg-white/10 hover:text-white transition"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink size={14} />
                    View Live Store
                  </span>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 font-medium">
                    Live
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-stone-400 hover:bg-rose-500/10 hover:text-rose-300 transition"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </aside>

            {/* Mobile Top App Bar */}
            <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#bf1e2e] text-sm font-bold text-white">
                  C
                </div>
                <span className="text-sm font-bold text-stone-900">Admin Studio</span>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  target="_blank"
                  className="p-2 text-stone-500 hover:text-stone-900"
                  aria-label="View storefront"
                >
                  <ExternalLink size={18} />
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"
                  aria-label="Open navigation menu"
                >
                  <Menu size={20} />
                </button>
              </div>
            </header>

            {/* Mobile Slide-Over Drawer */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 md:hidden flex">
                <div
                  className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div className="relative ml-auto flex h-full w-[280px] max-w-[85%] flex-col bg-[#1e1919] p-5 text-white shadow-2xl">
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <span className="text-sm font-bold">Admin Navigation</span>
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-lg p-1 text-stone-400 hover:text-white"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto py-4">
                    {renderNavLinks()}
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-rose-300 hover:bg-rose-500/10 transition"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Content Viewport */}
        <div className="min-w-0 flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </AdminLayoutContext.Provider>
  );
}
