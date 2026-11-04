"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  Pencil,
  Save,
  ExternalLink,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminToast } from "@/components/admin/admin-toast";

export type SectionType =
  | "hero_carousel"
  | "trust_strip"
  | "featured_products"
  | "category_showcase"
  | "why_calvin"
  | "how_it_works"
  | "faq"
  | "newsletter";

export type SectionContentValue =
  | string
  | number
  | boolean
  | Array<{ q: string; a: string }>
  | Array<{ icon: string; title: string; desc: string }>
  | Array<{ step: string; title: string; desc: string }>
  | string[]
  | Record<string, unknown>;

export type HomepageSection = {
  id: string;
  key: SectionType;
  title: string;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
  content: Record<string, SectionContentValue>;
};

const defaultSections: HomepageSection[] = [
  {
    id: "sec-hero",
    key: "hero_carousel",
    title: "Hero Banner Carousel",
    description: "Primary visual showcase with high-impact video/image slides and CTAs.",
    isEnabled: true,
    sortOrder: 1,
    content: {
      autoplaySeconds: 5,
      note: "Banner slides are managed in the Hero Banners module.",
    },
  },
  {
    id: "sec-trust",
    key: "trust_strip",
    title: "Trust & Quality Badges",
    description: "4-column guarantee bar highlighting craftsmanship and warranty.",
    isEnabled: true,
    sortOrder: 2,
    content: {
      badge1: "100% Traditional Stone Grinding",
      badge2: "Heavy Duty 1 HP Motor",
      badge3: "Free Doorstep Delivery Across India",
      badge4: "5-Year Manufacturer Warranty",
    },
  },
  {
    id: "sec-products",
    key: "featured_products",
    title: "Featured Product Showcase",
    description: "Primary product catalog showcase section.",
    isEnabled: true,
    sortOrder: 3,
    content: {
      headline: "Engineered for Purity, Designed for Everyday Living",
      subtitle: "Discover our premium domestic flour mill engineered for maximum nutrient retention.",
      maxDisplay: 4,
    },
  },
  {
    id: "sec-categories",
    key: "category_showcase",
    title: "Category Discovery",
    description: "Visual grid showcasing domestic and commercial aatamaker lines.",
    isEnabled: true,
    sortOrder: 4,
    content: {
      headline: "Browse by Mill Category",
      subtitle: "From compact domestic mills to semi-commercial heavy grinders.",
    },
  },
  {
    id: "sec-why",
    key: "why_calvin",
    title: "Why Calvin (Brand Story)",
    description: "4 pillars explaining nutrient retention, stone milling, and motor technology.",
    isEnabled: true,
    sortOrder: 5,
    content: {
      heading: "Fresh Atta. No Adulteration. Zero Nutrient Loss.",
      description: "Store-bought packaged flour is stripped of vital germ and dietary bran. Calvin Aatamaker gives your family 100% pure whole-grain nutrition daily.",
      pillar1_title: "Cold Grinding Technology",
      pillar1_desc: "Keeps flour cool to preserve sensitive vitamins and enzymes.",
      pillar2_title: "100% Food-Grade Chamber",
      pillar2_desc: "Corrosion-resistant stainless steel with hygienic seals.",
      pillar3_title: "Micro-Adjustment Fineness",
      pillar3_desc: "Dial from coarse multigrain daliya to super-fine maida.",
      pillar4_title: "Child Safety Interlock",
      pillar4_desc: "Instant auto-cutoff sensors protect children and pets.",
    },
  },
  {
    id: "sec-how",
    key: "how_it_works",
    title: "How It Works (Milling Guide)",
    description: "Step-by-step operating process guide for new buyers.",
    isEnabled: true,
    sortOrder: 6,
    content: {
      step1_title: "Select Your Grain",
      step1_desc: "Wheat, jowar, bajra, ragi, chana, rice, or custom grains.",
      step2_title: "Set Your Fineness",
      step2_desc: "Choose your preferred texture with the precision dial.",
      step3_title: "One-Touch Grinding",
      step3_desc: "Press start and watch the automated cold-milling process.",
      step4_title: "Fresh Nutrient-Rich Flour",
      step4_desc: "Collect flour in the anti-spill container ready for rotis.",
    },
  },
  {
    id: "sec-faq",
    key: "faq",
    title: "Frequently Asked Questions",
    description: "Answers to common grain milling, power consumption, and maintenance queries.",
    isEnabled: true,
    sortOrder: 7,
    content: {
      items: [
        {
          q: "Which grains can Calvin Aatamaker grind?",
          a: "It grinds wheat, rice, corn, millet, pulses (dal), spices, and gluten-free grains including quinoa and buckwheat.",
        },
        {
          q: "How much electricity does a 1 HP mill consume?",
          a: "Approximately 0.75 units of electricity per hour of operation, costing less than ₹6 for grinding 10 kg of wheat.",
        },
        {
          q: "Is any regular stone sharpening or maintenance required?",
          a: "No stone dressing is required. Our patented emery stones are balanced for thousands of kilograms of lifelong grinding.",
        },
      ],
    },
  },
  {
    id: "sec-newsletter",
    key: "newsletter",
    title: "Newsletter & VIP Club",
    description: "Email capture banner for grain recipes, healthy baking tips, and discounts.",
    isEnabled: true,
    sortOrder: 8,
    content: {
      headline: "Join the Pure Flour Revolution",
      subtitle: "Receive traditional grain guides, recipe ideas, and exclusive product updates.",
    },
  },
];

function strVal(val: unknown): string {
  return typeof val === "string" ? val : "";
}

export default function AdminHomepageCMSPage() {
  const [sections, setSections] = useState<HomepageSection[]>(defaultSections);
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, SectionContentValue>>({});
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load from database or local storage cache on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCMSConfig() {
      try {
        const { data, error } = await supabase
          .from("store_settings")
          .select("value, setting_value")
          .eq("setting_key", "homepage_sections_config")
          .maybeSingle();

        if (!error && data) {
          const val = data.value || data.setting_value;
          if (Array.isArray(val) && val.length > 0 && isMounted) {
            setSections(val as HomepageSection[]);
            return;
          }
        }
      } catch {
        // Fallback to local cache
      }

      try {
        const saved = localStorage.getItem("calvin-homepage-cms-config");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0 && isMounted) {
            setSections(parsed);
          }
        }
      } catch {
        // Fallback to default sections
      }
    }

    loadCMSConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  function handleToggleSection(id: string) {
    setSections((prev) =>
      prev.map((sec) => (sec.id === id ? { ...sec, isEnabled: !sec.isEnabled } : sec))
    );
    setHasUnsavedChanges(true);
  }

  function handleMoveSection(index: number, direction: "up" | "down") {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === sections.length - 1)
    ) {
      return;
    }

    const nextSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = nextSections[index];
    nextSections[index] = nextSections[targetIndex];
    nextSections[targetIndex] = temp;

    // Re-index sortOrder
    const reordered = nextSections.map((s, idx) => ({ ...s, sortOrder: idx + 1 }));
    setSections(reordered);
    setHasUnsavedChanges(true);
  }

  function handleOpenEdit(sec: HomepageSection) {
    setEditingSection(sec);
    setEditingContent(JSON.parse(JSON.stringify(sec.content)));
  }

  function handleSaveSectionContent() {
    if (!editingSection) return;

    setSections((prev) =>
      prev.map((sec) =>
        sec.id === editingSection.id ? { ...sec, content: editingContent } : sec
      )
    );
    setEditingSection(null);
    setHasUnsavedChanges(true);
    setToast({ message: `Updated configuration for "${editingSection.title}".`, variant: "info" });
  }

  async function handlePublishAll() {
    setSaving(true);
    try {
      // Persist to local cache
      localStorage.setItem("calvin-homepage-cms-config", JSON.stringify(sections));
      window.dispatchEvent(new Event("calvin-homepage-updated"));

      // 1. Attempt storing in store_settings
      try {
        await supabase.from("store_settings").upsert({
          setting_key: "homepage_sections_config",
          category: "catalogue",
          description: "Homepage section ordering and structured content",
          value: sections,
          setting_value: sections,
          is_public: true,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Table pending migration
      }

      // 2. Also attempt syncing individual rows to homepage_sections table
      try {
        for (const sec of sections) {
          await supabase.from("homepage_sections").upsert(
            {
              section_key: sec.key,
              title: sec.title,
              description: sec.description,
              is_enabled: sec.isEnabled,
              sort_order: sec.sortOrder,
              content: sec.content,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "section_key" }
          );
        }
      } catch {
        // Non-fatal if table pending
      }

      setHasUnsavedChanges(false);
      setToast({
        message: "Homepage CMS configuration published successfully! Storefront updated.",
        variant: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error publishing homepage";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1400px] mx-auto w-full">
      <AdminHeader
        title="Homepage CMS Studio"
        subtitle="Control homepage section ordering, enable or disable sections, and customize headlines without code edits."
        breadcrumbs={[{ label: "Storefront CMS" }, { label: "Homepage Studio" }]}
        actions={
          <>
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <ExternalLink size={14} />
              Preview Storefront
            </Link>

            <button
              onClick={handlePublishAll}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
                hasUnsavedChanges
                  ? "bg-[#bf1e2e] hover:bg-[#a01824] animate-pulse"
                  : "bg-stone-900 hover:bg-stone-800"
              }`}
            >
              <Save size={14} />
              {saving ? "Publishing..." : hasUnsavedChanges ? "Publish Changes *" : "Published"}
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

      {hasUnsavedChanges && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-800 flex items-center justify-between">
          <span>You have unpublished layout or content changes. Click <strong>&quot;Publish Changes&quot;</strong> to apply them to the live storefront.</span>
        </div>
      )}

      {/* Sections List */}
      <div className="space-y-3">
        {sections.map((section, index) => (
          <div
            key={section.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border p-4 transition shadow-2xs ${
              section.isEnabled
                ? "border-stone-200/90 bg-white"
                : "border-stone-200 bg-stone-50/70 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-xs font-mono font-bold text-stone-500">
                {section.sortOrder}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-stone-900">{section.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      section.isEnabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {section.isEnabled ? "Visible" : "Hidden"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">{section.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
              {/* Order Controls */}
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMoveSection(index, "up")}
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed text-stone-600 transition"
                title="Move Section Up"
              >
                <MoveUp size={15} />
              </button>
              <button
                type="button"
                disabled={index === sections.length - 1}
                onClick={() => handleMoveSection(index, "down")}
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed text-stone-600 transition"
                title="Move Section Down"
              >
                <MoveDown size={15} />
              </button>

              {/* Visibility Toggle */}
              <button
                type="button"
                onClick={() => handleToggleSection(section.id)}
                className={`p-1.5 rounded-lg border transition ${
                  section.isEnabled
                    ? "border-stone-200 text-stone-600 hover:bg-stone-100"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
                title={section.isEnabled ? "Hide from Storefront" : "Show on Storefront"}
              >
                {section.isEnabled ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>

              {/* Edit Content */}
              {section.key === "hero_carousel" ? (
                <Link
                  href="/admin/banners"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 transition"
                >
                  <Pencil size={13} />
                  Manage Slides
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenEdit(section)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 transition"
                >
                  <Pencil size={13} />
                  Edit Content
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Section Content Editor Dialog */}
      <AdminDialog
        isOpen={!!editingSection}
        onClose={() => setEditingSection(null)}
        title={editingSection ? `Configure: ${editingSection.title}` : "Section Editor"}
        description="Edit structured text and section options. Changes will apply to the storefront upon publishing."
        maxWidth="xl"
      >
        {editingSection && (
          <div className="space-y-4">
            {/* Dynamic fields based on section key */}
            {editingSection.key === "trust_strip" && (
              <div className="space-y-3">
                {["badge1", "badge2", "badge3", "badge4"].map((key, i) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                      Badge #{i + 1}
                    </label>
                    <input
                      type="text"
                      value={strVal(editingContent[key])}
                      onChange={(e) =>
                        setEditingContent((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
                    />
                  </div>
                ))}
              </div>
            )}

            {editingSection.key === "featured_products" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Section Headline
                  </label>
                  <input
                    type="text"
                    value={strVal(editingContent.headline)}
                    onChange={(e) =>
                      setEditingContent((p) => ({ ...p, headline: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Subtitle Description
                  </label>
                  <textarea
                    rows={2}
                    value={strVal(editingContent.subtitle)}
                    onChange={(e) =>
                      setEditingContent((p) => ({ ...p, subtitle: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
                  />
                </div>
              </div>
            )}

            {editingSection.key === "why_calvin" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Heading
                  </label>
                  <input
                    type="text"
                    value={strVal(editingContent.heading)}
                    onChange={(e) => setEditingContent((p) => ({ ...p, heading: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Story Description
                  </label>
                  <textarea
                    rows={3}
                    value={strVal(editingContent.description)}
                    onChange={(e) => setEditingContent((p) => ({ ...p, description: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs outline-none focus:border-[#bf1e2e]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-stone-600">Pillar 1 Title</label>
                    <input
                      type="text"
                      value={strVal(editingContent.pillar1_title)}
                      onChange={(e) => setEditingContent((p) => ({ ...p, pillar1_title: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600">Pillar 2 Title</label>
                    <input
                      type="text"
                      value={strVal(editingContent.pillar2_title)}
                      onChange={(e) => setEditingContent((p) => ({ ...p, pillar2_title: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600">Pillar 3 Title</label>
                    <input
                      type="text"
                      value={strVal(editingContent.pillar3_title)}
                      onChange={(e) => setEditingContent((p) => ({ ...p, pillar3_title: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600">Pillar 4 Title</label>
                    <input
                      type="text"
                      value={strVal(editingContent.pillar4_title)}
                      onChange={(e) => setEditingContent((p) => ({ ...p, pillar4_title: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {editingSection.key === "faq" && (
              <div className="space-y-4">
                <p className="text-xs text-stone-500">Edit the primary FAQ items displayed on the homepage:</p>
                {(Array.isArray(editingContent.items) ? (editingContent.items as Array<{ q: string; a: string }>) : []).map((faq, i) => (
                  <div key={i} className="p-3 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
                    <span className="text-[10px] font-bold uppercase text-stone-400">Question #{i + 1}</span>
                    <input
                      type="text"
                      value={faq.q}
                      onChange={(e) => {
                        const current = Array.isArray(editingContent.items) ? [...(editingContent.items as Array<{ q: string; a: string }>)] : [];
                        current[i] = { ...current[i], q: e.target.value };
                        setEditingContent((p) => ({ ...p, items: current }));
                      }}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold"
                    />
                    <textarea
                      rows={2}
                      value={faq.a}
                      onChange={(e) => {
                        const current = Array.isArray(editingContent.items) ? [...(editingContent.items as Array<{ q: string; a: string }>)] : [];
                        current[i] = { ...current[i], a: e.target.value };
                        setEditingContent((p) => ({ ...p, items: current }));
                      }}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Newsletter section */}
            {editingSection.key === "newsletter" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600">Headline</label>
                  <input
                    type="text"
                    value={strVal(editingContent.headline)}
                    onChange={(e) => setEditingContent((p) => ({ ...p, headline: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600">Subtitle</label>
                  <textarea
                    rows={2}
                    value={strVal(editingContent.subtitle)}
                    onChange={(e) => setEditingContent((p) => ({ ...p, subtitle: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSectionContent}
                className="rounded-xl bg-[#bf1e2e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a01824] transition"
              >
                Apply Changes
              </button>
            </div>
          </div>
        )}
      </AdminDialog>
    </main>
  );
}
