"use client";

import React from "react";
import styles from "./homepage-emi-showcase.module.css";

export interface BankPartner {
  id: string;
  name: string;
  badge: string;
  logo: React.ReactNode;
}

const BANK_PARTNERS: BankPartner[] = [
  {
    id: "hdfc",
    name: "HDFC Bank",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#004C8F" />
        <rect x="7" y="7" width="18" height="18" rx="2" fill="#FFFFFF" />
        <rect x="10" y="10" width="12" height="12" fill="#ED232A" />
        <rect x="13" y="6" width="6" height="20" fill="#004C8F" />
        <rect x="6" y="13" width="20" height="6" fill="#004C8F" />
      </svg>
    ),
  },
  {
    id: "icici",
    name: "ICICI Bank",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#F58220" />
        <circle cx="16" cy="16" r="10" fill="#B82626" />
        <path
          d="M13 10H16C18.2 10 19.5 11.3 19.5 13C19.5 14.5 18.5 15.6 17 15.9V16.1C18.7 16.4 20 17.6 20 19.5C20 21.5 18.3 22.8 15.8 22.8H13V10Z"
          fill="#FFFFFF"
        />
        <circle cx="16" cy="16" r="4" fill="#F58220" />
      </svg>
    ),
  },
  {
    id: "sbi",
    name: "State Bank of India",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#0082C6" />
        <circle cx="16" cy="16" r="10" fill="#FFFFFF" />
        <circle cx="16" cy="16" r="6" fill="#0082C6" />
        <rect x="15" y="16" width="2" height="9" fill="#FFFFFF" />
      </svg>
    ),
  },
  {
    id: "axis",
    name: "Axis Bank",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#97144D" />
        <path d="M16 6L25 24H20.5L16 14.5L11.5 24H7L16 6Z" fill="#FFFFFF" />
        <path d="M16 14.5L18.25 19H13.75L16 14.5Z" fill="#97144D" />
      </svg>
    ),
  },
  {
    id: "kotak",
    name: "Kotak Mahindra Bank",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#ED1C24" />
        <path
          d="M10 16C10 13.8 11.8 12 14 12C15.8 12 17.3 13.2 17.8 14.8C18.2 13.7 19.3 12.8 20.6 12.4C20.4 12.1 20 12 19.5 12C17.5 12 16 13.5 16 15.5C16 17.5 17.5 19 19.5 19C20.5 19 21.4 18.6 22 18V20C21.3 20.6 20.4 21 19.5 21C16.5 21 14 18.8 14 16C14 14.9 14.4 13.9 15.1 13.1C14.8 13 14.4 13 14 13C12.3 13 11 14.3 11 16C11 17.7 12.3 19 14 19H17V21H14C11.2 21 9 18.8 9 16H10Z"
          fill="#FFFFFF"
        />
        <circle cx="21" cy="16" r="3" fill="#003366" />
      </svg>
    ),
  },
  {
    id: "bob",
    name: "Bank of Baroda",
    badge: "No Cost EMI",
    logo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#F26522" />
        <path
          d="M16 7C11 7 7 11 7 16C7 21 11 25 16 25C19.5 25 22.5 23 24 20H19.5C18.5 21.5 16.8 22.5 15 22.5C11.4 22.5 8.5 19.6 8.5 16C8.5 12.4 11.4 9.5 15 9.5C16.8 9.5 18.5 10.5 19.5 12H24C22.5 9 19.5 7 16 7Z"
          fill="#FFFFFF"
        />
        <circle cx="16" cy="16" r="3.5" fill="#FFFFFF" />
      </svg>
    ),
  },
];

interface HomepageEmiShowcaseProps {
  content?: Record<string, unknown>;
}

export default function HomepageEmiShowcase({
  content,
}: HomepageEmiShowcaseProps) {
  const headline =
    typeof content?.headline === "string" && content.headline.trim().length > 0
      ? content.headline
      : "No Cost EMI Available";

  const subtitle =
    typeof content?.subtitle === "string" && content.subtitle.trim().length > 0
      ? content.subtitle
      : "Enjoy flexible payment options with our banking partners.";

  return (
    <section
      id="homepage-emi-showcase"
      data-section="emi_showcase"
      className={styles.section}
      aria-labelledby="emi-showcase-heading"
    >
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            <span>FLEXIBLE PAYMENT PLANS</span>
            <span className={styles.eyebrowLine} />
          </div>

          <h2 id="emi-showcase-heading" className={styles.heading}>
            {headline}
          </h2>

          <p className={styles.subheading}>{subtitle}</p>
        </div>
      </div>

      {/* Seamless Moving Marquee */}
      <div
        className={styles.marqueeWrapper}
        aria-label="Participating No Cost EMI Banks Carousel"
        role="region"
      >
        <div className={styles.marqueeTrack}>
          {/* Primary Sequence */}
          <div className={styles.marqueeGroup}>
            {BANK_PARTNERS.map((bank) => (
              <div key={`bank-1-${bank.id}`} className={styles.bankPill}>
                <div className={styles.bankLogo}>{bank.logo}</div>
                <span className={styles.bankName}>{bank.name}</span>
                <span className={styles.bankBadge}>{bank.badge}</span>
              </div>
            ))}
          </div>

          {/* Duplicated Sequence for Continuous Seamless Loop */}
          <div className={styles.marqueeGroup} aria-hidden="true">
            {BANK_PARTNERS.map((bank) => (
              <div key={`bank-2-${bank.id}`} className={styles.bankPill}>
                <div className={styles.bankLogo}>{bank.logo}</div>
                <span className={styles.bankName}>{bank.name}</span>
                <span className={styles.bankBadge}>{bank.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Verification & Consumer Transparency Notice */}
      <div className={styles.disclaimerWrapper}>
        <span className={styles.disclaimerText}>
          <span>*</span>
          <span>
            Preliminary banking partners. Exact tenures (3, 6, 9 or 12 months) and No Cost EMI availability are subject to payment gateway merchant onboarding.
          </span>
        </span>
      </div>
    </section>
  );
}
