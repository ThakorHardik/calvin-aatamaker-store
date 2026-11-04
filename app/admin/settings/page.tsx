"use client";

import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Building,
  Mail,
  Save,
  Globe,
  Truck,
  Bell,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminToast } from "@/components/admin/admin-toast";

type StoreSettings = {
  storeName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  contactEmail: string;
  contactPhone: string;
  whatsappLink: string;
  address: string;
  gstin: string;
  currency: string;
  isAcceptingOrders: boolean;
  maintenanceMessage: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLink: string;
  freeShippingThreshold: number;
};

const defaultSettings: StoreSettings = {
  storeName: "CALVIN AATAMAKER",
  tagline: "India's Premier Domestic Flour Mills",
  logoUrl: "",
  faviconUrl: "",
  contactEmail: "care@calvinaatamaker.com",
  contactPhone: "+91 98765 43210",
  whatsappLink: "https://wa.me/919876543210",
  address: "Plot 42, GIDC Engineering Zone, Ahmedabad, Gujarat 382445, India",
  gstin: "24AAAAA0000A1Z5",
  currency: "INR (₹)",
  isAcceptingOrders: true,
  maintenanceMessage: "Storefront is briefly undergoing scheduled maintenance. We will be back online shortly.",
  announcementEnabled: true,
  announcementText: "Free Doorstep Delivery Across India · 5-Year Domestic Motor Warranty",
  announcementLink: "/products",
  freeShippingThreshold: 0,
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("calvin-store-settings");
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch {
      // Use defaults
    }
  }, []);

  function updateField<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      localStorage.setItem("calvin-store-settings", JSON.stringify(settings));

      try {
        await supabase.from("store_settings").upsert({
          setting_key: "general_store_settings",
          category: "general",
          description: "Global business parameters, contact, and announcement bar",
          value: settings,
          setting_value: settings,
          is_public: true,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Table pending migration
      }

      setIsDirty(false);
      window.dispatchEvent(new Event("calvin-settings-updated"));
      setToast({ message: "Store settings updated successfully.", variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving settings";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 p-5 sm:p-7 lg:p-10 max-w-[1300px] mx-auto w-full">
      <AdminHeader
        title="Store Settings"
        subtitle="Manage business contact details, announcement bars, order acceptance state, and store policies."
        breadcrumbs={[{ label: "Brand & Settings" }, { label: "Store Settings" }]}
        actions={
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
              isDirty ? "bg-[#bf1e2e] hover:bg-[#a01824]" : "bg-stone-900 hover:bg-stone-800"
            }`}
          >
            <Save size={14} />
            {saving ? "Saving..." : isDirty ? "Save Settings *" : "Settings Saved"}
          </button>
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

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Business Identity */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 pb-3 border-b border-stone-100">
            <Building size={16} className="text-[#bf1e2e]" />
            Brand Profile & Identification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Store Name *
              </label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => updateField("storeName", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Brand Tagline
              </label>
              <input
                type="text"
                value={settings.tagline}
                onChange={(e) => updateField("tagline", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs outline-none focus:border-[#bf1e2e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                GSTIN / Tax ID
              </label>
              <input
                type="text"
                value={settings.gstin}
                onChange={(e) => updateField("gstin", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono uppercase outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Store Currency
              </label>
              <input
                type="text"
                readOnly
                value={settings.currency}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-600 outline-none"
              />
              <span className="text-[10px] text-stone-400 mt-1 block">CALVIN AATAMAKER operates exclusively in Indian Rupees (₹).</span>
            </div>
          </div>
        </section>

        {/* Section 2: Contact & Support */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 pb-3 border-b border-stone-100">
            <Mail size={16} className="text-[#bf1e2e]" />
            Customer Contact & Support Channels
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Support Email Address
              </label>
              <input
                type="email"
                required
                value={settings.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Helpline Phone
              </label>
              <input
                type="tel"
                value={settings.contactPhone}
                onChange={(e) => updateField("contactPhone", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                WhatsApp Support Link
              </label>
              <input
                type="text"
                value={settings.whatsappLink}
                onChange={(e) => updateField("whatsappLink", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono outline-none focus:border-[#bf1e2e]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
              Registered Physical / Factory Address
            </label>
            <textarea
              rows={2}
              value={settings.address}
              onChange={(e) => updateField("address", e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs outline-none focus:border-[#bf1e2e]"
            />
          </div>
        </section>

        {/* Section 3: Announcement Bar & Shipping Display */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 pb-3 border-b border-stone-100">
            <Bell size={16} className="text-[#bf1e2e]" />
            Storefront Announcement Bar
          </h2>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="announcement-toggle"
              checked={settings.announcementEnabled}
              onChange={(e) => updateField("announcementEnabled", e.target.checked)}
              className="h-4 w-4 rounded text-[#bf1e2e]"
            />
            <label htmlFor="announcement-toggle" className="text-xs font-semibold text-stone-800 cursor-pointer">
              Enable top announcement banner on storefront
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Banner Message Text
              </label>
              <input
                type="text"
                value={settings.announcementText}
                onChange={(e) => updateField("announcementText", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs outline-none focus:border-[#bf1e2e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Click Destination URL
              </label>
              <input
                type="text"
                value={settings.announcementLink}
                onChange={(e) => updateField("announcementLink", e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono outline-none focus:border-[#bf1e2e]"
              />
            </div>
          </div>

          {/* Shipping Safety Note */}
          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5 text-xs text-stone-600 flex items-start gap-2.5">
            <Truck size={16} className="text-stone-500 shrink-0 mt-0.5" />
            <p>
              <strong>Shipping Configuration Guard:</strong> Storefront displays free pan-India doorstep delivery. Per enterprise specification, modifying shipping settings here updates storefront guidance, while core transactional rates in `create_checkout_order` remain strictly managed until authorized.
            </p>
          </div>
        </section>

        {/* Section 4: Store Availability */}
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2 pb-3 border-b border-stone-100">
            <Globe size={16} className="text-[#bf1e2e]" />
            Storefront Operation Status
          </h2>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="order-accepting"
              checked={settings.isAcceptingOrders}
              onChange={(e) => updateField("isAcceptingOrders", e.target.checked)}
              className="h-4 w-4 rounded text-[#bf1e2e]"
            />
            <label htmlFor="order-accepting" className="text-xs font-semibold text-stone-800 cursor-pointer">
              Store is Live & Accepting Online Orders
            </label>
          </div>

          {!settings.isAcceptingOrders && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-amber-800 mb-1">
                Maintenance Notice Message
              </label>
              <textarea
                rows={2}
                value={settings.maintenanceMessage}
                onChange={(e) => updateField("maintenanceMessage", e.target.value)}
                className="w-full rounded-xl border border-amber-300 bg-amber-50/50 px-3.5 py-2 text-xs outline-none"
              />
            </div>
          )}
        </section>
      </form>
    </main>
  );
}
