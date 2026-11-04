"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
        if (Array.isArray(parsed.footerLegalLinks) && parsed.footerLegalLinks.length > 0) {
          setLegalLinks(parsed.footerLegalLinks);
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <Link
          href="/"
          className="footer-logo"
          aria-label="Calvin Aatamaker home"
        >
          <Image
            src="/images/calvin-aatamaker-logo.png"
            alt="Calvin Aatamaker"
            width={150}
            height={65}
          />
        </Link>

        <p>
          Fresh flour feels like home.
          <br />A more thoughtful way to mill every day.
        </p>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/products">Shop Aatamakers</Link>
          <Link href="/#why-calvin">Our approach</Link>
          <Link href="/pages/contact">Contact Support</Link>
          {legalLinks.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              target={link.isExternal ? "_blank" : undefined}
              rel={link.isExternal ? "noopener noreferrer" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="footer-bottom">
        <span>© {year} Calvin Aatamaker. All rights reserved.</span>

        <span className="demo-notice">
          Website preview · Product prices and contact details are subject to
          confirmation.
        </span>

        <Link href="/admin">
          Admin panel <ArrowRight size={13} />
        </Link>
      </div>
    </footer>
  );
}
