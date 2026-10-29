"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
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
  const seconds = Number(banner.display_seconds) || 5;

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

  const banner = banners[activeIndex];

  if (loading || banners.length === 0 || !banner) {
    return (
      <section
        className={`${styles.hero} ${styles.fallback}`}
        aria-label="Calvin Aatamaker introduction"
      >
        <div className={styles.arch} aria-hidden="true" />

        <div className={styles.fallbackDecor} aria-hidden="true">
          <span className={styles.wheatMark}>✳</span>
        </div>

        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>
            <Sparkles size={15} aria-hidden="true" />
            Thoughtfully made for Indian homes
          </span>

          <h1 className={styles.headline}>
            Fresh flour.
            <span className={styles.headlineAccent}>Feels like home.</span>
          </h1>

          <p className={styles.description}>
            Bring the goodness of freshly milled flour into your everyday
            kitchen.
          </p>

          <Link className={styles.cta} href="/products">
            Explore Aatamakers
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>

          <p className={styles.smallNote}>
            Made for home. Made for everyday life.
          </p>
        </div>

        {loading && (
          <span className={styles.loadingNote} role="status">
            Loading store promotions…
          </span>
        )}
      </section>
    );
  }

  const isVideo = banner.media_type.toLowerCase() === "video";
  const mediaSrc = getMediaUrl(banner.media_path);
  const destination = getSafeHref(banner.button_href);
  const isExternal = /^https?:\/\//i.test(destination);

  return (
    <section
      className={styles.hero}
      aria-label="Featured Calvin Aatamaker promotions"
      aria-roledescription="carousel"
    >
      <div className={styles.mediaLayer} key={banner.id}>
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
              aria-label={banner.alt_text || banner.title}
              className={styles.media}
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <img
              key={mediaSrc}
              src={mediaSrc}
              alt={banner.alt_text || banner.title}
              className={styles.media}
              onError={() => setMediaFailed(true)}
            />
          ))}
      </div>

      <div className={styles.imageOverlay} aria-hidden="true" />
      <div className={styles.arch} aria-hidden="true" />

      <div className={styles.heroContent} key={`${banner.id}-content`}>
        <span className={styles.eyebrow}>
          <Sparkles size={15} aria-hidden="true" />
          Calvin Aatamaker
        </span>

        <h1 className={styles.headline}>{banner.title}</h1>

        {banner.subtitle && (
          <p className={styles.description}>{banner.subtitle}</p>
        )}

        {banner.button_label &&
          (isExternal ? (
            <a
              className={styles.cta}
              href={destination}
              target="_blank"
              rel="noopener noreferrer"
            >
              {banner.button_label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          ) : (
            <Link className={styles.cta} href={destination}>
              {banner.button_label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ))}
      </div>

      {mediaFailed && (
        <div className={styles.mediaError} role="status">
          The banner image or video could not be loaded.
        </div>
      )}

      {banners.length > 1 && (
        <div className={styles.controls}>
          <div className={styles.pagination} aria-label="Choose a banner">
            {banners.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.dot} ${
                  index === activeIndex ? styles.dotActive : ""
                }`}
                aria-label={`Show banner ${index + 1}: ${item.title}`}
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
              aria-label="Previous banner"
            >
              <ArrowLeft size={18} />
            </button>

            <button
              className={styles.arrowButton}
              type="button"
              onClick={showNext}
              aria-label="Next banner"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
