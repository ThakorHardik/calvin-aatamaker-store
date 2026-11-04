"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

import {
  Pencil,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminToast } from "@/components/admin/admin-toast";

type StorePage = {
  id: string;
  slug: string;
  title: string;
  pageType: "policy" | "standard" | "contact" | "about";
  isPublished: boolean;
  metaTitle: string;
  metaDescription: string;
  content: string;
  updatedAt: string;
};

const defaultPages: StorePage[] = [
  {
    id: "p1",
    slug: "about",
    title: "About Calvin Aatamaker",
    pageType: "about",
    isPublished: true,
    metaTitle: "About Us — Calvin Aatamaker Domestic Flour Mills",
    metaDescription: "Learn about Calvin Aatamaker's mission to bring unadulterated whole-grain nutrition to Indian households.",
    content: "Calvin Aatamaker is dedicated to preserving traditional stone-ground nutrition through precision German-engineered domestic flour mills. Manufactured in Gujarat, our mills empower Indian families to enjoy fresh, unadulterated atta with 100% natural bran and germ retention.",
    updatedAt: "2026-11-01",
  },
  {
    id: "p2",
    slug: "contact",
    title: "Contact & Customer Care",
    pageType: "contact",
    isPublished: true,
    metaTitle: "Contact Us — Customer Support & Pan-India Service",
    metaDescription: "Get in touch with the Calvin Aatamaker team for technical support, warranty registrations, and sales inquiries.",
    content: "Reach our customer experience team via WhatsApp, phone, or email. We offer pan-India doorstep technician support and genuine spare parts.",
    updatedAt: "2026-11-01",
  },
  {
    id: "p3",
    slug: "shipping",
    title: "Shipping & Delivery Policy",
    pageType: "policy",
    isPublished: true,
    metaTitle: "Shipping Policy — Free Pan-India Delivery | Calvin Aatamaker",
    metaDescription: "Free, insured doorstep delivery across India. Learn about our dispatch times and heavy cargo logistics.",
    content: "[DRAFT — CLIENT APPROVAL PENDING]\n\nAll Calvin Aatamaker flour mills are shipped with heavy-duty wooden crate packaging and full transit insurance. Deliveries typically arrive within 4–7 business days across metropolitan cities and Tier 2/3 locations in India. Tracking numbers are dispatched via SMS and email.",
    updatedAt: "2026-11-01",
  },
  {
    id: "p4",
    slug: "returns",
    title: "Return & Refund Policy",
    pageType: "policy",
    isPublished: true,
    metaTitle: "Returns & Refund Policy — Calvin Aatamaker",
    metaDescription: "10-day replacement guarantee for transit damage and manufacturing defects.",
    content: "[DRAFT — CLIENT APPROVAL PENDING]\n\nWe provide a 10-day replacement window for any transit damage or manufacturing defects reported upon unboxing. Because flour mills are food-contact machinery, returns of used equipment are subject to inspection by our technical service centers.",
    updatedAt: "2026-11-01",
  },
  {
    id: "p5",
    slug: "privacy",
    title: "Privacy Policy",
    pageType: "policy",
    isPublished: true,
    metaTitle: "Privacy Policy — Calvin Aatamaker",
    metaDescription: "How we collect, protect, and use your personal and payment information.",
    content: "[DRAFT — CLIENT APPROVAL PENDING]\n\nCalvin Aatamaker respects customer privacy. We collect customer names, shipping addresses, phone numbers, and emails strictly for order fulfillment, warranty registration, and communication. We never sell or share customer personal information with unauthorized third parties.",
    updatedAt: "2026-11-01",
  },
  {
    id: "p6",
    slug: "terms",
    title: "Terms of Service",
    pageType: "policy",
    isPublished: true,
    metaTitle: "Terms of Service — Calvin Aatamaker",
    metaDescription: "Standard terms and conditions governing purchases and website usage.",
    content: "[DRAFT — CLIENT APPROVAL PENDING]\n\nBy accessing and purchasing from Calvin Aatamaker, you agree to our terms of commercial sale, warranty limitations, and domestic usage guidelines. Electrical specifications require 220–240V AC 50Hz single-phase power supply.",
    updatedAt: "2026-11-01",
  },
];

export default function AdminPagesPage() {
  const [pages, setPages] = useState<StorePage[]>(defaultPages);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  // Edit State
  const [editingPage, setEditingPage] = useState<StorePage | null>(null);
  const [formData, setFormData] = useState<Partial<StorePage>>({});


  useEffect(() => {
    try {
      const saved = localStorage.getItem("calvin-pages-config");
      if (saved) {
        setPages(JSON.parse(saved));
      }
    } catch {
      // Use defaults
    }
  }, []);

  function handleOpenEdit(page: StorePage) {
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      content: page.content,
      isPublished: page.isPublished,
    });
  }

  function handleSavePage() {
    if (!editingPage) return;

    const updated = pages.map((p) =>
      p.id === editingPage.id
        ? {
            ...p,
            ...formData,
            updatedAt: new Date().toISOString().split("T")[0],
          }
        : p
    );

    setPages(updated as StorePage[]);
    localStorage.setItem("calvin-pages-config", JSON.stringify(updated));
    window.dispatchEvent(new Event("calvin-pages-updated"));

    try {
      void supabase.from("cms_pages").upsert({
        slug: formData.slug,
        title: formData.title,
        meta_title: formData.metaTitle,
        meta_description: formData.metaDescription,
        content: formData.content,
        is_published: formData.isPublished,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Table pending migration
    }

    setEditingPage(null);
    setToast({ message: `Page "${formData.title}" saved.`, variant: "success" });
  }

  const filteredPages = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1400px] mx-auto w-full">
      <AdminHeader
        title="Pages & Policy SEO"
        subtitle="Manage brand story, contact information, customer care policies, and search engine metadata."
        breadcrumbs={[{ label: "Storefront CMS" }, { label: "Pages & SEO" }]}
      />

      {toast && (
        <AdminToast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
          className="mb-5"
        />
      )}

      {/* Draft Disclaimer Notice */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3">
        <ShieldAlert size={18} className="shrink-0 text-amber-700 mt-0.5" />
        <div>
          <p className="font-bold">Legal Policy Draft Safeguard</p>
          <p className="mt-0.5 text-amber-800 leading-relaxed">
            Legal policies (Privacy, Terms, Shipping, Returns) are pre-populated with clear, industry-standard drafts. They are marked for final review so your legal counsel can approve text before formal brand publication.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-5 max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages by title or slug..."
          className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-stone-400 transition"
        />
      </div>

      {/* Pages Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPages.map((page) => (
          <div
            key={page.id}
            className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs hover:border-stone-300 transition"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-mono text-stone-600">
                /{page.slug}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  page.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}
              >
                {page.isPublished ? "Published" : "Draft"}
              </span>
            </div>

            <h3 className="mt-3 text-sm font-bold text-stone-900">{page.title}</h3>
            <p className="mt-1 text-xs text-stone-500 line-clamp-2">{page.metaDescription}</p>

            <div className="mt-auto pt-4 flex items-center justify-between border-t border-stone-100 text-xs">
              <span className="text-[10px] text-stone-400">Updated: {page.updatedAt}</span>
              <button
                type="button"
                onClick={() => handleOpenEdit(page)}
                className="inline-flex items-center gap-1 font-semibold text-[#bf1e2e] hover:underline"
              >
                <Pencil size={13} /> Edit Page & SEO
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Page Modal */}
      <AdminDialog
        isOpen={!!editingPage}
        onClose={() => setEditingPage(null)}
        title={editingPage ? `Edit: ${editingPage.title}` : "Edit Page"}
        description="Update page body copy, SEO titles, and search engine snippets."
        maxWidth="xl"
      >
        {editingPage && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                  Page Title *
                </label>
                <input
                  type="text"
                  value={formData.title || ""}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                  URL Slug
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.slug || ""}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-mono text-stone-500"
                />
              </div>
            </div>

            {/* SEO Section */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#bf1e2e]" /> Search Engine Optimization (SEO)
              </span>

              <div>
                <label className="block text-xs font-semibold text-stone-600">Meta Title Tag</label>
                <input
                  type="text"
                  value={formData.metaTitle || ""}
                  onChange={(e) => setFormData((p) => ({ ...p, metaTitle: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600">Meta Description</label>
                <textarea
                  rows={2}
                  value={formData.metaDescription || ""}
                  onChange={(e) => setFormData((p) => ({ ...p, metaDescription: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* Page Content */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                Page Body Content
              </label>
              <textarea
                rows={6}
                value={formData.content || ""}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs font-mono leading-relaxed outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-100">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData((p) => ({ ...p, isPublished: e.target.checked }))}
                  className="h-4 w-4 rounded text-[#bf1e2e]"
                />
                Publish this page
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  className="rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePage}
                  className="rounded-xl bg-[#bf1e2e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a01824]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminDialog>
    </main>
  );
}
