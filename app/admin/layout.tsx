"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Images,
  Package,
  ShoppingBag,
  Users,
  Palette,
  Settings,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const navigation = [
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
    title: "STORE MANAGEMENT",
    items: [
      {
        label: "Homepage banners",
        href: "/admin/banners",
        icon: Images,
      },
      {
        label: "Products & categories",
        href: "/admin/products",
        icon: Package,
      },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingBag,
      },
      {
        label: "Customers",
        href: null,
        icon: Users,
      },
    ],
  },
  {
    title: "CUSTOMISATION",
    items: [
      {
        label: "Design studio",
        href: null,
        icon: Palette,
      },
    ],
  },
  {
    title: "CONFIGURATION",
    items: [
      {
        label: "Store settings",
        href: null,
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

  return (
    <div className="min-h-screen bg-[#f7f7f5] md:flex">
      <aside className="w-full shrink-0 bg-[#211b1b] text-white md:sticky md:top-0 md:h-screen md:w-[260px]">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#bf1e2e] text-xl font-black">
              C
            </div>

            <div>
              <p className="text-sm font-bold tracking-wide">
                CALVIN AATAMAKER
              </p>
              <p className="mt-1 text-xs text-stone-400">Store management</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-stone-300">
              Administration workspace
            </span>
          </div>
        </div>

        <nav className="flex gap-5 overflow-x-auto p-3 md:block md:space-y-6 md:overflow-y-auto md:p-4">
          {navigation.map((group) => (
            <div key={group.title} className="min-w-fit">
              <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.16em] text-stone-500">
                {group.title}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : item.href !== null && pathname.startsWith(item.href);

                  const className = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-[#bf1e2e] font-semibold text-white shadow-lg shadow-black/10"
                      : item.href
                        ? "text-stone-300 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-stone-500"
                  }`;

                  const content = (
                    <>
                      <Icon size={18} strokeWidth={1.8} />
                      <span>{item.label}</span>

                      {active && <ChevronRight size={15} className="ml-auto" />}

                      {!item.href && (
                        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9px]">
                          SOON
                        </span>
                      )}
                    </>
                  );

                  return item.href ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={className}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={item.label}
                      aria-disabled="true"
                      title="This section is under development"
                      className={className}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-white/10 p-4 md:block">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone-300 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={17} />
            View storefront
          </Link>

          <p className="px-3 pt-3 text-[10px] text-stone-500">
            CALVIN AATAMAKER · ADMIN
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
