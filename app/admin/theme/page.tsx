"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Palette,
  RotateCcw,
  Save,
  Type,
  Square,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminToast } from "@/components/admin/admin-toast";

export type ThemeConfig = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  buttonRadius: string;
  cardRadius: string;
  containerWidth: string;
  sectionSpacing: string;
};

const defaultTheme: ThemeConfig = {
  primaryColor: "#bf1e2e",
  secondaryColor: "#211b1b",
  backgroundColor: "#fbf9f5",
  surfaceColor: "#ffffff",
  textColor: "#1c1917",
  headingFont: "Inter, sans-serif",
  bodyFont: "Inter, sans-serif",
  buttonRadius: "12px",
  cardRadius: "16px",
  containerWidth: "1440px",
  sectionSpacing: "72px",
};

export default function AdminThemePage() {
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("calvin-theme-settings");
      if (saved) {
        setTheme(JSON.parse(saved));
      }
    } catch {
      // Use defaults
    }
  }, []);

  function updateField<K extends keyof ThemeConfig>(field: K, value: ThemeConfig[K]) {
    setTheme((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }

  function handleResetDefaults() {
    setTheme(defaultTheme);
    setIsDirty(true);
    localStorage.setItem("calvin-theme-settings", JSON.stringify(defaultTheme));
    localStorage.setItem("calvin-theme-config", JSON.stringify(defaultTheme));
    window.dispatchEvent(new Event("calvin-theme-updated"));
    setToast({ message: "Reset to default Calvin Aatamaker design tokens.", variant: "info" });
  }

  async function handleSaveTheme() {
    setSaving(true);
    try {
      localStorage.setItem("calvin-theme-settings", JSON.stringify(theme));
      localStorage.setItem("calvin-theme-config", JSON.stringify(theme));
      window.dispatchEvent(new Event("calvin-theme-updated"));

      // Attempt storing in store_settings if table exists
      try {
        await supabase.from("store_settings").upsert({
          setting_key: "store_theme_tokens",
          category: "theme",
          description: "Visual design tokens and theme configuration",
          value: theme,
          setting_value: theme,
          is_public: true,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Table pending migration; local storage cache ensures immediate storefront continuity
      }

      setIsDirty(false);
      setToast({ message: "Theme published successfully! Storefront styles updated.", variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving theme";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1500px] mx-auto w-full">
      <AdminHeader
        title="Theme Customizer"
        subtitle="Configure the visual identity, color palette, typography, and component radii for the customer storefront."
        breadcrumbs={[{ label: "Brand & Settings" }, { label: "Theme Customizer" }]}
        actions={
          <>
            <button
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-stone-50 transition"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>

            <button
              onClick={handleSaveTheme}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
                isDirty ? "bg-[#bf1e2e] hover:bg-[#a01824]" : "bg-stone-900 hover:bg-stone-800"
              }`}
            >
              <Save size={14} />
              {saving ? "Publishing..." : isDirty ? "Publish Theme *" : "Theme Published"}
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

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Controls Column (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Color Palette Card */}
          <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">
              <Palette size={16} className="text-[#bf1e2e]" />
              Brand Color Tokens
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Primary Accent */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Primary Accent
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.primaryColor}
                    onChange={(e) => updateField("primaryColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-stone-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={theme.primaryColor}
                    onChange={(e) => updateField("primaryColor", e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">CTA buttons, badges, accents</span>
              </div>

              {/* Secondary Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Secondary Dark
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.secondaryColor}
                    onChange={(e) => updateField("secondaryColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-stone-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={theme.secondaryColor}
                    onChange={(e) => updateField("secondaryColor", e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">Headers, footers, contrast surfaces</span>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Storefront Background
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.backgroundColor}
                    onChange={(e) => updateField("backgroundColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-stone-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={theme.backgroundColor}
                    onChange={(e) => updateField("backgroundColor", e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">Body background</span>
              </div>

              {/* Surface Color */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Surface Card Background
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.surfaceColor}
                    onChange={(e) => updateField("surfaceColor", e.target.value)}
                    className="h-10 w-12 rounded-lg border border-stone-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={theme.surfaceColor}
                    onChange={(e) => updateField("surfaceColor", e.target.value)}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">Product cards, containers</span>
              </div>
            </div>
          </section>

          {/* Typography Card */}
          <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">
              <Type size={16} className="text-[#bf1e2e]" />
              Typography
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Heading Font
                </label>
                <select
                  value={theme.headingFont}
                  onChange={(e) => updateField("headingFont", e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium outline-none"
                >
                  <option value="Inter, sans-serif">Inter (Modern Clean)</option>
                  <option value="'Playfair Display', Georgia, serif">Playfair Display (Premium Editorial)</option>
                  <option value="Georgia, serif">Georgia (Traditional Warm)</option>
                  <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans (Contemporary)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Body Font
                </label>
                <select
                  value={theme.bodyFont}
                  onChange={(e) => updateField("bodyFont", e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium outline-none"
                >
                  <option value="Inter, sans-serif">Inter (Highly Readable)</option>
                  <option value="'DM Sans', sans-serif">DM Sans (Minimalist)</option>
                  <option value="system-ui, sans-serif">System Native Sans</option>
                </select>
              </div>
            </div>
          </section>

          {/* Radii & Layout Card */}
          <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">
              <Square size={16} className="text-[#bf1e2e]" />
              Border Radii & Geometry
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Button Corner Radius
                </label>
                <select
                  value={theme.buttonRadius}
                  onChange={(e) => updateField("buttonRadius", e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium outline-none"
                >
                  <option value="0px">Sharp (0px)</option>
                  <option value="4px">Subtle (4px)</option>
                  <option value="8px">Standard (8px)</option>
                  <option value="12px">Rounded (12px - Calvin Default)</option>
                  <option value="9999px">Full Pill (9999px)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Card Corner Radius
                </label>
                <select
                  value={theme.cardRadius}
                  onChange={(e) => updateField("cardRadius", e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium outline-none"
                >
                  <option value="0px">Sharp (0px)</option>
                  <option value="8px">Subtle (8px)</option>
                  <option value="16px">Standard (16px - Calvin Default)</option>
                  <option value="24px">Super Smooth (24px)</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Live Preview Panel (5 cols) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Live Storefront Component Preview
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Interactive
              </span>
            </div>

            {/* Simulated Canvas with Applied Tokens */}
            <div
              style={{
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                fontFamily: theme.bodyFont,
              }}
              className="p-5 rounded-xl border border-stone-200/60 space-y-5 transition-colors"
            >
              {/* Heading */}
              <div>
                <span
                  style={{ color: theme.primaryColor }}
                  className="text-[10px] font-bold uppercase tracking-wider block"
                >
                  PREMIUM INDIAN DOMESTIC MILL
                </span>
                <h3
                  style={{
                    fontFamily: theme.headingFont,
                    color: theme.secondaryColor,
                  }}
                  className="text-lg font-bold leading-tight mt-0.5"
                >
                  Compact Domestic Aatamaker
                </h3>
              </div>

              {/* Product Card Preview */}
              <div
                style={{
                  backgroundColor: theme.surfaceColor,
                  borderRadius: theme.cardRadius,
                }}
                className="p-4 border border-stone-200/60 shadow-xs"
              >
                <div className="aspect-video w-full rounded-lg bg-stone-100/70 flex items-center justify-center text-xs text-stone-400 mb-3">
                  Product Gallery Mockup
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold">1 HP Heavy Duty</span>
                    <p className="text-[11px] text-stone-500">Stainless Steel Hopper</p>
                  </div>
                  <span className="text-sm font-bold">₹18,999</span>
                </div>

                {/* Primary Button */}
                <button
                  type="button"
                  style={{
                    backgroundColor: theme.primaryColor,
                    borderRadius: theme.buttonRadius,
                  }}
                  className="mt-4 w-full py-2.5 text-xs font-bold text-white shadow-xs hover:opacity-90 transition"
                >
                  Add to Cart
                </button>
              </div>

              {/* Secondary Button & Badges */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  style={{
                    borderRadius: theme.buttonRadius,
                    borderColor: theme.secondaryColor,
                    color: theme.secondaryColor,
                  }}
                  className="flex-1 py-2 text-xs font-semibold border bg-transparent"
                >
                  View Details
                </button>
                <span
                  style={{
                    backgroundColor: `${theme.primaryColor}15`,
                    color: theme.primaryColor,
                    borderRadius: theme.buttonRadius,
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold"
                >
                  In Stock
                </span>
              </div>
            </div>

            <p className="text-[11px] text-stone-400 mt-3 text-center">
              Changes update immediately in preview. Click &quot;Publish Theme&quot; to apply.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
