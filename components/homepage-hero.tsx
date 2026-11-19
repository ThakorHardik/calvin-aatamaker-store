"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Palette,
  ShieldCheck,
  Sparkles,
  Wheat,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import styles from "./homepage-hero.module.css";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  media_type: string;
  media_path: string;
  alt_text: string | null;
  button_label: string | null;
  button_href: string | null;
  sort_order: number;
  display_seconds: number;
  starts_at: string | null;
  ends_at: string | null;
};

const DEFAULT_BANNER_FALLBACK_IMAGE = "/images/compact-atta-chakki-source.jpeg";

function getMediaUrl(path: string): string {
  const value = path.trim();

  if (/^https?:\/\//i.test(value)) return value;

  const cleanPath = value
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/banner-media\//, "")
    .replace(/^banner-media\//, "");

  return supabase.storage.from("banner-media").getPublicUrl(cleanPath).data
    .publicUrl;
}

function getSafeHref(value: string | null): string {
  if (!value?.trim()) return "/products";

  const href = value.trim();

  if (href.startsWith("/") && !href.startsWith("//")) return href;

  try {
    const url = new URL(href);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    // Invalid destinations fall back to the product catalogue.
  }

  return "/products";
}

function isAvailableNow(banner: Banner, now: number): boolean {
  if (banner.starts_at) {
    const starts = new Date(banner.starts_at).getTime();

    if (!Number.isFinite(starts) || starts > now) return false;
  }

  if (banner.ends_at) {
    const ends = new Date(banner.ends_at).getTime();

    if (!Number.isFinite(ends) || ends <= now) return false;
  }

  return true;
}

function getDuration(banner: Banner): number {
  const seconds = Number(banner.display_seconds) || 6;

  return Math.min(30, Math.max(3, seconds));
}

export default function HomepageHero() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mediaFailed, setMediaFailed] = useState(false);

  const loadBanners = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("banners")
        .select(
          "id,title,subtitle,media_type,media_path,alt_text,button_label,button_href,sort_order,display_seconds,starts_at,ends_at",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Could not load homepage banners:", error.message);
        setBanners([]);
        return;
      }

      const now = Date.now();

      const available = ((data ?? []) as Banner[]).filter(
        (banner) =>
          Boolean(banner.title?.trim()) &&
          Boolean(banner.media_path?.trim()) &&
          isAvailableNow(banner, now),
      );

      setBanners(available);
      setActiveIndex(0);
      setMediaFailed(false);
    } catch (error) {
      console.error("Unexpected homepage banner error:", error);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBanners();
  }, [loadBanners]);

  useEffect(() => {
    if (banners.length < 2) return;

    const current = banners[activeIndex];

    if (!current) return;

    const timer = window.setTimeout(
      () => {
        setActiveIndex((index) => (index + 1) % banners.length);
        setMediaFailed(false);
      },
      getDuration(current) * 1000,
    );

    return () => window.clearTimeout(timer);
  }, [banners, activeIndex]);

  function showPrevious() {
    setActiveIndex((index) => (index - 1 + banners.length) % banners.length);
    setMediaFailed(false);
  }

  function showNext() {
    setActiveIndex((index) => (index + 1) % banners.length);
    setMediaFailed(false);
  }

  const currentBanner = banners[activeIndex];

  // Fallback banner structure when database returns empty or during loading
  const effectiveBanner: Banner = currentBanner ?? {
    id: "fallback-hero-banner",
    title: "Fresh flour. Feels like home.",
    subtitle:
      "Bring the goodness of freshly milled flour into your everyday kitchen. 100% natural nutrition, stone-ground purity, and bespoke front panel personalization.",
    media_type: "image",
    media_path: DEFAULT_BANNER_FALLBACK_IMAGE,
    alt_text: "Calvin Compact Domestic Aatamaker Promotional Banner",
    button_label: "Explore Aatamakers",
    button_href: "/products",
    sort_order: 1,
    display_seconds: 6,
    starts_at: null,
    ends_at: null,
  };

  const isVideo = effectiveBanner.media_type.toLowerCase() === "video";
  const mediaSrc =
    effectiveBanner.media_path === DEFAULT_BANNER_FALLBACK_IMAGE
      ? DEFAULT_BANNER_FALLBACK_IMAGE
      : getMediaUrl(effectiveBanner.media_path);

  const destination = getSafeHref(effectiveBanner.button_href);
  const isExternal = /^https?:\/\//i.test(destination);
  const primaryButtonLabel =
    effectiveBanner.button_label?.trim() || "Explore Aatamakers";

  return (
    <section
      className={styles.hero}
      aria-label="Featured Calvin Aatamaker promotions"
      aria-roledescription="carousel"
    >
      {/* ------------------------------------------------------------------
          1. FULL-BLEED BACKGROUND MEDIA LAYER (Image or Video)
         ------------------------------------------------------------------ */}
      <div className={styles.mediaLayer} key={effectiveBanner.id}>
        {!mediaFailed &&
          (isVideo ? (
            <video
              key={mediaSrc}
              src={mediaSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={effectiveBanner.alt_text || effectiveBanner.title}
              className={styles.media}
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <Image
              key={mediaFailed ? "fallback-media" : mediaSrc}
              src={mediaFailed ? DEFAULT_BANNER_FALLBACK_IMAGE : mediaSrc}
              alt={effectiveBanner.alt_text || effectiveBanner.title}
              fill
              priority
              unoptimized={mediaSrc.startsWith("http")}
              className={styles.media}
              onError={() => setMediaFailed(true)}
            />
          ))}
      </div>

      {/* ------------------------------------------------------------------
          2. SOPHISTICATED EDITORIAL GRADIENT OVERLAY
         ------------------------------------------------------------------ */}
      <div className={styles.imageOverlay} aria-hidden="true" />

      {/* ------------------------------------------------------------------
          3. EDITORIAL BRAND CONTENT ON TOP OF MOVING BANNER
         ------------------------------------------------------------------ */}
      <div className={styles.heroContainer}>
        <div className={styles.heroContent} key={`${effectiveBanner.id}-content`}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowIcon} aria-hidden="true">
              <Wheat size={14} />
            </span>
            <span>Calvin Aatamaker</span>
            <span className={styles.eyebrowDot}>•</span>
            <span>Domestic Atta Chakki</span>
          </div>

          <h1 className={styles.headline}>
            {effectiveBanner.title}
          </h1>

          {effectiveBanner.subtitle && (
            <p className={styles.description}>{effectiveBanner.subtitle}</p>
          )}

          {/* Value Highlights Strip */}
          <div className={styles.valueHighlightStrip}>
            <div className={styles.highlightPill}>
              <Wheat size={13} className={styles.highlightIcon} aria-hidden="true" />
              <span>100% Stone-Ground</span>
            </div>
            <div className={styles.highlightPill}>
              <Palette size={13} className={styles.highlightIcon} aria-hidden="true" />
              <span>Personalised Art Panel</span>
            </div>
            <div className={styles.highlightPill}>
              <ShieldCheck size={13} className={styles.highlightIcon} aria-hidden="true" />
              <span>5-Year Motor Warranty</span>
            </div>
          </div>

          {/* Call to Action Buttons */}
          <div className={styles.actionGroup}>
            {isExternal ? (
              <a
                className={styles.primaryCta}
                href={destination}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{primaryButtonLabel}</span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            ) : (
              <Link className={styles.primaryCta} href={destination}>
                <span>{primaryButtonLabel}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}

            <Link
              className={styles.secondaryCta}
              href="/products/compact-domestic-aatamaker/customize"
            >
              <Sparkles size={16} className={styles.highlightIcon} aria-hidden="true" />
              <span>Personalise Machine</span>
            </Link>
          </div>
        </div>
      </div>

      {mediaFailed && (
        <div className={styles.mediaError} role="status">
          The primary banner asset could not be reached; showing genuine product fallback.
        </div>
      )}

      {loading && (
        <span className={styles.loadingNote} role="status">
          Updating promotions…
        </span>
      )}

      {/* ------------------------------------------------------------------
          4. REFINED CAROUSEL CONTROLS (Active when multiple slides exist)
         ------------------------------------------------------------------ */}
      {banners.length > 1 && (
        <div className={styles.controls}>
          <div className={styles.pagination} aria-label="Choose a promotion">
            {banners.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.dot} ${
                  index === activeIndex ? styles.dotActive : ""
                }`}
                aria-label={`Show promotion ${index + 1}: ${item.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => {
                  setActiveIndex(index);
                  setMediaFailed(false);
                }}
              />
            ))}
          </div>

          <div className={styles.counterAndArrows}>
            <span className={styles.counter} aria-live="polite">
              {String(activeIndex + 1).padStart(2, "0")} /{" "}
              {String(banners.length).padStart(2, "0")}
            </span>

            <button
              className={styles.arrowButton}
              type="button"
              onClick={showPrevious}
              aria-label="Previous promotion"
            >
              <ArrowLeft size={16} />
            </button>

            <button
              className={styles.arrowButton}
              type="button"
              onClick={showNext}
              aria-label="Next promotion"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
