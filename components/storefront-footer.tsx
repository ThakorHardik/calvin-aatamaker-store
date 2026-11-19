"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

type NavLinkItem = {
  id: string;
  label: string;
  href: string;
  isExternal?: boolean;
};

export default function StorefrontFooter() {
  const year = new Date().getFullYear();
  const [legalLinks, setLegalLinks] = useState<NavLinkItem[]>([
    { id: "fl-1", label: "About Calvin", href: "/pages/about" },
    { id: "fl-2", label: "Shipping Policy", href: "/pages/shipping" },
    { id: "fl-3", label: "Returns & Warranty", href: "/pages/returns" },
    { id: "fl-4", label: "Privacy Policy", href: "/pages/privacy" },
    { id: "fl-5", label: "Terms of Service", href: "/pages/terms" },
    { id: "fl-6", label: "Customer Care", href: "/pages/contact" },
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("calvin-nav-menus");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed.footerLegalLinks) &&
          parsed.footerLegalLinks.length > 0
        ) {
          setLegalLinks(parsed.footerLegalLinks);
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  return (
    <footer
      className="site-footer border-t border-[#D9B88F]/25 bg-[#141211] text-[#FAF7F2]"
      aria-label="Site footer"
    >
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between lg:gap-12">
          {/* Brand info */}
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-block"
              aria-label="Calvin Aatamaker home"
            >
              <Image
                src="/images/calvin-aatamaker-logo.png"
                alt="Calvin Aatamaker"
                width={140}
                height={60}
                className="h-auto w-28 brightness-0 invert opacity-95 transition-opacity hover:opacity-100 sm:w-32"
              />
            </Link>

            <p className="mt-4 text-xs leading-relaxed text-[#A8A29E] sm:text-sm">
              Fresh flour feels like home.
              <br />A more thoughtful, natural way to mill flour every day.
            </p>

            <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-[#D9B88F]">
              <ShieldCheck className="h-4 w-4 text-[#D9B88F]" />
              <span>Engineered for Indian Modular Kitchens</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav
            className="flex flex-wrap gap-x-8 gap-y-3 md:justify-end"
            aria-label="Footer navigation"
          >
            <Link
              href="/products"
              className="text-xs font-semibold text-[#EDE0CF] transition-colors hover:text-[#D9B88F] sm:text-sm"
            >
              Shop Aatamakers
            </Link>
            <Link
              href="/#why-calvin"
              className="text-xs font-semibold text-[#EDE0CF] transition-colors hover:text-[#D9B88F] sm:text-sm"
            >
              Our Approach
            </Link>
            <Link
              href="/pages/contact"
              className="text-xs font-semibold text-[#EDE0CF] transition-colors hover:text-[#D9B88F] sm:text-sm"
            >
              Contact Support
            </Link>
            {legalLinks.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                target={link.isExternal ? "_blank" : undefined}
                rel={link.isExternal ? "noopener noreferrer" : undefined}
                className="text-xs text-[#A8A29E] transition-colors hover:text-[#FAF7F2] sm:text-sm"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-[#8A827D] sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Calvin Aatamaker. All rights reserved.</span>

          <span className="text-[11px] text-[#A8A29E]">
            Website preview · Product prices and contact details are subject to
            confirmation.
          </span>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 font-semibold text-[#D9B88F] transition-colors hover:text-white"
          >
            <span>Admin panel</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
