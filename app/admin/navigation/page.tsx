"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  ExternalLink,
  Link as LinkIcon,
  Share2,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminToast } from "@/components/admin/admin-toast";

type NavLink = {
  id: string;
  label: string;
  href: string;
  isExternal: boolean;
  isEnabled: boolean;
};

type FooterColumn = {
  title: string;
  links: NavLink[];
};

type SocialLinks = {
  whatsapp: string;
  instagram: string;
  facebook: string;
  youtube: string;
};

const defaultHeaderLinks: NavLink[] = [
  { id: "h1", label: "Home", href: "/", isExternal: false, isEnabled: true },
  { id: "h2", label: "Shop Products", href: "/products", isExternal: false, isEnabled: true },
  { id: "h3", label: "Why Calvin", href: "/#why-calvin", isExternal: false, isEnabled: true },
  { id: "h4", label: "How It Works", href: "/#how-it-works", isExternal: false, isEnabled: true },
  { id: "h5", label: "FAQ", href: "/#faq", isExternal: false, isEnabled: true },
  { id: "h6", label: "Contact", href: "/contact", isExternal: false, isEnabled: true },
];

const defaultFooterColumns: FooterColumn[] = [
  {
    title: "Explore",
    links: [
      { id: "f1", label: "All Products", href: "/products", isExternal: false, isEnabled: true },
      { id: "f2", label: "Domestic Aatamaker", href: "/products/compact-domestic-aatamaker", isExternal: false, isEnabled: true },
      { id: "f3", label: "Customer Reviews", href: "/#testimonials", isExternal: false, isEnabled: true },
      { id: "f4", label: "Milling Guide", href: "/#how-it-works", isExternal: false, isEnabled: true },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { id: "f5", label: "Track Your Order", href: "/account/orders", isExternal: false, isEnabled: true },
      { id: "f6", label: "Shipping Policy", href: "/shipping", isExternal: false, isEnabled: true },
      { id: "f7", label: "Return & Refund Policy", href: "/returns", isExternal: false, isEnabled: true },
      { id: "f8", label: "Support & Warranty", href: "/contact", isExternal: false, isEnabled: true },
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      { id: "f9", label: "Privacy Policy", href: "/privacy", isExternal: false, isEnabled: true },
      { id: "f10", label: "Terms of Service", href: "/terms", isExternal: false, isEnabled: true },
      { id: "f11", label: "GST & Manufacturing", href: "/about", isExternal: false, isEnabled: true },
    ],
  },
];

const defaultSocials: SocialLinks = {
  whatsapp: "https://wa.me/919876543210",
  instagram: "https://instagram.com/calvinaatamaker",
  facebook: "https://facebook.com/calvinaatamaker",
  youtube: "https://youtube.com/@calvinaatamaker",
};

export default function AdminNavigationPage() {
  const [activeTab, setActiveTab] = useState<"header" | "footer" | "socials">("header");
  const [headerLinks, setHeaderLinks] = useState<NavLink[]>(defaultHeaderLinks);
  const [footerColumns, setFooterColumns] = useState<FooterColumn[]>(defaultFooterColumns);
  const [socials, setSocials] = useState<SocialLinks>(defaultSocials);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Link Dialog
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ type: "header" | "footer"; colIndex?: number; link?: NavLink } | null>(null);
  const [linkForm, setLinkForm] = useState({ label: "", href: "", isExternal: false, isEnabled: true });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("calvin-navigation-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.headerLinks) setHeaderLinks(parsed.headerLinks);
        if (parsed.footerColumns) setFooterColumns(parsed.footerColumns);
        if (parsed.socials) setSocials(parsed.socials);
      }
    } catch {
      // Use defaults
    }
  }, []);

  function handleOpenAddLink(type: "header" | "footer", colIndex?: number) {
    setEditingTarget({ type, colIndex });
    setLinkForm({ label: "", href: "/", isExternal: false, isEnabled: true });
    setIsLinkDialogOpen(true);
  }

  function handleOpenEditLink(link: NavLink, type: "header" | "footer", colIndex?: number) {
    setEditingTarget({ type, colIndex, link });
    setLinkForm({
      label: link.label,
      href: link.href,
      isExternal: link.isExternal,
      isEnabled: link.isEnabled,
    });
    setIsLinkDialogOpen(true);
  }

  function handleSaveLink() {
    if (!editingTarget) return;

    // Validate URL format
    const trimmedHref = linkForm.href.trim();
    if (!trimmedHref.startsWith("/") && !trimmedHref.startsWith("http://") && !trimmedHref.startsWith("https://")) {
      setToast({ message: "URL must be a valid path (e.g., /products) or complete web link (https://...).", variant: "error" });
      return;
    }

    if (editingTarget.type === "header") {
      if (editingTarget.link) {
        setHeaderLinks((prev) =>
          prev.map((l) => (l.id === editingTarget.link?.id ? { ...l, ...linkForm, href: trimmedHref } : l))
        );
      } else {
        setHeaderLinks((prev) => [
          ...prev,
          { id: `h-${Date.now()}`, ...linkForm, href: trimmedHref },
        ]);
      }
    } else if (editingTarget.type === "footer" && editingTarget.colIndex !== undefined) {
      const colIdx = editingTarget.colIndex;
      setFooterColumns((prev) => {
        const next = [...prev];
        if (editingTarget.link) {
          next[colIdx].links = next[colIdx].links.map((l) =>
            l.id === editingTarget.link?.id ? { ...l, ...linkForm, href: trimmedHref } : l
          );
        } else {
          next[colIdx].links.push({ id: `f-${Date.now()}`, ...linkForm, href: trimmedHref });
        }
        return next;
      });
    }

    setIsLinkDialogOpen(false);
    setIsDirty(true);
    setToast({ message: `Saved navigation item "${linkForm.label}".`, variant: "info" });
  }

  function handleDeleteLink(id: string, type: "header" | "footer", colIndex?: number) {
    if (type === "header") {
      setHeaderLinks((prev) => prev.filter((l) => l.id !== id));
    } else if (type === "footer" && colIndex !== undefined) {
      setFooterColumns((prev) => {
        const next = [...prev];
        next[colIndex].links = next[colIndex].links.filter((l) => l.id !== id);
        return next;
      });
    }
    setIsDirty(true);
  }

  async function handlePublishAll() {
    setSaving(true);
    try {
      const payload = { headerLinks, footerColumns, socials };
      localStorage.setItem("calvin-navigation-settings", JSON.stringify(payload));
      localStorage.setItem("calvin-nav-menus", JSON.stringify(payload));
      window.dispatchEvent(new Event("calvin-nav-updated"));

      try {
        await supabase.from("store_settings").upsert({
          setting_key: "storefront_navigation_menus",
          category: "navigation",
          description: "Main header and footer menu structures",
          value: payload,
          setting_value: payload,
          is_public: true,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Table pending migration
      }

      setIsDirty(false);
      setToast({ message: "Navigation menus published successfully! Storefront updated.", variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving navigation";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1400px] mx-auto w-full">
      <AdminHeader
        title="Navigation & Menus"
        subtitle="Manage storefront main header links, multi-column footer navigation, and official social channels."
        breadcrumbs={[{ label: "Storefront CMS" }, { label: "Navigation" }]}
        actions={
          <>
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <ExternalLink size={14} />
              View Storefront
            </Link>

            <button
              onClick={handlePublishAll}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
                isDirty ? "bg-[#bf1e2e] hover:bg-[#a01824]" : "bg-stone-900 hover:bg-stone-800"
              }`}
            >
              <Save size={14} />
              {saving ? "Publishing..." : isDirty ? "Publish Navigation *" : "Published"}
            </button>
          </>
        }
      />

      {toast && (
        <AdminToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          className="mb-5"
        />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("header")}
          className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
            activeTab === "header"
              ? "border-[#bf1e2e] text-[#bf1e2e]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          Main Header Menu ({headerLinks.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("footer")}
          className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
            activeTab === "footer"
              ? "border-[#bf1e2e] text-[#bf1e2e]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          Footer Columns ({footerColumns.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("socials")}
          className={`pb-3 px-3 text-xs font-bold transition border-b-2 ${
            activeTab === "socials"
              ? "border-[#bf1e2e] text-[#bf1e2e]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          Social Channels & Links
        </button>
      </div>

      {/* TAB 1: Header Links */}
      {activeTab === "header" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500">Items displayed in the top storefront header bar:</p>
            <button
              type="button"
              onClick={() => handleOpenAddLink("header")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              <Plus size={13} /> Add Menu Item
            </button>
          </div>

          <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white overflow-hidden shadow-xs">
            {headerLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3.5 hover:bg-stone-50/60 transition"
              >
                <div className="flex items-center gap-3">
                  <LinkIcon size={15} className="text-stone-400" />
                  <div>
                    <span className="text-xs font-bold text-stone-800">{link.label}</span>
                    <span className="ml-2 font-mono text-[11px] text-stone-400">{link.href}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      link.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {link.isEnabled ? "Active" : "Hidden"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenEditLink(link, "header")}
                    className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg transition"
                    title="Edit Item"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink(link.id, "header")}
                    className="p-1.5 text-stone-400 hover:text-rose-700 rounded-lg transition"
                    title="Remove Item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 2: Footer Columns */}
      {activeTab === "footer" && (
        <section className="grid gap-6 md:grid-cols-3">
          {footerColumns.map((col, cIdx) => (
            <div key={col.title} className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-800">
                  {col.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenAddLink("footer", cIdx)}
                  className="p-1 text-stone-500 hover:text-stone-900 rounded transition"
                  title="Add Link to Column"
                >
                  <Plus size={15} />
                </button>
              </div>

              <div className="space-y-2 flex-1">
                {col.links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between py-1.5 text-xs text-stone-700 hover:bg-stone-50 rounded px-1.5 transition"
                  >
                    <div className="truncate pr-2">
                      <span className="font-medium">{link.label}</span>
                      <p className="text-[10px] font-mono text-stone-400 truncate">{link.href}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditLink(link, "footer", cIdx)}
                        className="p-1 text-stone-400 hover:text-stone-700"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLink(link.id, "footer", cIdx)}
                        className="p-1 text-stone-400 hover:text-rose-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* TAB 3: Social Links */}
      {activeTab === "socials" && (
        <section className="max-w-xl rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-2">
            <Share2 size={16} className="text-[#bf1e2e]" /> Official Brand Social Channels
          </h2>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              WhatsApp Support Link
            </label>
            <input
              type="text"
              value={socials.whatsapp}
              onChange={(e) => {
                setSocials((p) => ({ ...p, whatsapp: e.target.value }));
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Instagram Handle URL
            </label>
            <input
              type="text"
              value={socials.instagram}
              onChange={(e) => {
                setSocials((p) => ({ ...p, instagram: e.target.value }));
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Facebook Page URL
            </label>
            <input
              type="text"
              value={socials.facebook}
              onChange={(e) => {
                setSocials((p) => ({ ...p, facebook: e.target.value }));
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              YouTube Channel URL
            </label>
            <input
              type="text"
              value={socials.youtube}
              onChange={(e) => {
                setSocials((p) => ({ ...p, youtube: e.target.value }));
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </section>
      )}

      {/* Link Edit Dialog */}
      <AdminDialog
        isOpen={isLinkDialogOpen}
        onClose={() => setIsLinkDialogOpen(false)}
        title={editingTarget?.link ? "Edit Link" : "Add Navigation Link"}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Link Label *
            </label>
            <input
              type="text"
              required
              value={linkForm.label}
              onChange={(e) => setLinkForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Grain Milling Guide"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Destination URL *
            </label>
            <input
              type="text"
              required
              value={linkForm.href}
              onChange={(e) => setLinkForm((p) => ({ ...p, href: e.target.value }))}
              placeholder="e.g. /products or https://..."
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono outline-none focus:border-[#bf1e2e]"
            />
          </div>

          <div className="space-y-2 pt-2">
            <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={linkForm.isExternal}
                onChange={(e) => setLinkForm((p) => ({ ...p, isExternal: e.target.checked }))}
                className="h-4 w-4 rounded text-[#bf1e2e]"
              />
              Open in new tab
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer block">
              <input
                type="checkbox"
                checked={linkForm.isEnabled}
                onChange={(e) => setLinkForm((p) => ({ ...p, isEnabled: e.target.checked }))}
                className="h-4 w-4 rounded text-[#bf1e2e]"
              />
              Link is visible
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIsLinkDialogOpen(false)}
              className="rounded-xl border border-stone-200 px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveLink}
              className="rounded-xl bg-[#bf1e2e] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#a01824]"
            >
              Save Link
            </button>
          </div>
        </div>
      </AdminDialog>
    </main>
  );
}
