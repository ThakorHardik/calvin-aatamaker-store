import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StorefrontHeader from "@/components/storefront-header";
import StorefrontFooter from "@/components/storefront-footer";
import { ArrowLeft, Clock, ShieldCheck, Mail, Phone, MapPin, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

type StorePage = {
  id?: string;
  slug: string;
  title: string;
  page_type?: string;
  is_published: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  content: string;
  updated_at?: string;
};

const defaultPages: Record<string, StorePage> = {
  about: {
    slug: "about",
    title: "About Calvin Aatamaker",
    is_published: true,
    meta_title: "About Us — Calvin Aatamaker Domestic Flour Mills",
    meta_description:
      "Learn about Calvin Aatamaker's mission to bring unadulterated whole-grain nutrition to Indian households.",
    content: `Calvin Aatamaker is dedicated to preserving traditional stone-ground nutrition through precision German-engineered domestic flour mills. Manufactured in Gujarat, our mills empower Indian families to enjoy fresh, unadulterated atta with 100% natural bran and germ retention.

Packaged grocery store flours often endure industrial roller milling at temperatures upwards of 90°C, stripping away the heat-sensitive germ oil, vital B-vitamins, and dietary fiber to maximize commercial shelf life.

Calvin mills operate on patented cool-grinding natural emery stones running at optimized RPMs, ensuring that the natural taste, golden bran, and nutritional integrity of whole wheat, millets, and ancient grains remain intact from grain hopper to your flour container.`,
    updated_at: "2026-11-01",
  },
  contact: {
    slug: "contact",
    title: "Contact & Customer Care",
    is_published: true,
    meta_title: "Contact Us — Customer Support & Pan-India Service",
    meta_description:
      "Get in touch with the Calvin Aatamaker team for technical support, warranty registrations, and sales inquiries.",
    content: `Need assistance with product selection, delivery scheduling, or warranty registration? Our Ahmedabad customer care team is available Monday through Saturday, 9:30 AM to 6:30 PM IST.

We provide comprehensive pan-India service coverage, door-to-door technician assistance, and genuine manufacturer replacement parts for all Calvin domestic flour mills.`,
    updated_at: "2026-11-01",
  },
  shipping: {
    slug: "shipping",
    title: "Shipping & Delivery Policy",
    is_published: true,
    meta_title: "Shipping Policy — Free Pan-India Delivery | Calvin Aatamaker",
    meta_description:
      "Free, insured doorstep delivery across India. Learn about our dispatch times and heavy cargo logistics.",
    content: `All Calvin domestic flour mills include complimentary, insured doorstep delivery across 19,000+ PIN codes in India.

Orders are securely crated in multi-wall protective packaging and dispatched from our Gujarat manufacturing facility within 24 to 48 business hours. Typical transit times range between 3 to 7 business days depending on destination logistics.

Upon dispatch, real-time cargo tracking details and transit status notifications are shared via SMS and email. Every consignment is 100% insured against accidental in-transit damage.`,
    updated_at: "2026-11-01",
  },
  returns: {
    slug: "returns",
    title: "Cancellation, Returns & Warranty",
    is_published: true,
    meta_title: "Returns & Warranty Policy — Calvin Aatamaker",
    meta_description:
      "Learn about our 10-day replacement window and 5-year domestic motor warranty.",
    content: `Every Calvin domestic flour mill includes a 5-Year Domestic Motor Warranty and a 1-Year Comprehensive Machine Warranty covering electronic sensors and chassis components.

In the rare event that your shipment arrives with transit damage or a manufacturing irregularity, please report it within 10 days of delivery with unboxing photographs or video proof. Our support desk will promptly arrange a free doorstep replacement or dispatch an authorized service engineer.

Because grain mills are food-contact domestic appliances, units that have been put into regular grain use cannot be returned for arbitrary remorse reasons.`,
    updated_at: "2026-11-01",
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    is_published: true,
    meta_title: "Privacy Policy — Calvin Aatamaker",
    meta_description:
      "How we safeguard your customer data and personal privacy.",
    content: `Calvin Aatamaker is committed to safeguarding your personal data and privacy. We collect customer names, shipping addresses, telephone numbers, and email addresses solely to fulfill purchases, coordinate freight logistics, and service warranties.

We never sell, rent, license, or monetize customer contact information with third-party marketing brokers. All checkout transaction communications are encrypted using modern cryptographic standards.`,
    updated_at: "2026-11-01",
  },
  terms: {
    slug: "terms",
    title: "Terms of Service",
    is_published: true,
    meta_title: "Terms of Service — Calvin Aatamaker",
    meta_description:
      "Standard terms and conditions governing purchases and website usage.",
    content: `By purchasing a Calvin domestic flour mill or using this storefront, you agree to these Terms of Service.

All domestic flour mills are manufactured strictly for private domestic household milling. Using domestic units for commercial flour packaging, bulk contract grinding, or industrial operations voids the manufacturer domestic warranty.

Electrical requirements specify 220–240V AC 50Hz single-phase input. All legal disputes are subject to the exclusive jurisdiction of the competent courts in Ahmedabad, Gujarat, India.`,
    updated_at: "2026-11-01",
  },
};

type Props = {
  params: Promise<{ slug: string }>;
};

async function getPageData(slug: string): Promise<StorePage | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (!error && data) {
      return {
        slug: data.slug,
        title: data.title,
        page_type: data.page_type,
        is_published: data.is_published,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        content: data.content,
        updated_at: data.updated_at,
      };
    }
  } catch {
    // If Supabase table is pending migration, fallback to default policy templates
  }

  return defaultPages[slug] || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageData(slug);

  if (!page) {
    return {
      title: "Page Not Found | Calvin Aatamaker",
    };
  }

  return {
    title: page.meta_title || `${page.title} | Calvin Aatamaker`,
    description:
      page.meta_description ||
      `Official ${page.title} information for Calvin domestic flour mills.`,
  };
}

export default async function PublicCMSPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageData(slug);

  if (!page) {
    notFound();
  }

  const isContact = slug === "contact";

  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-900 flex flex-col justify-between">
      <div>
        <StorefrontHeader />

        <main className="mx-auto max-w-4xl px-5 py-10 sm:py-16 sm:px-8">
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-stone-500">
              <li>
                <Link href="/" className="hover:text-[#bf1e2e] transition">
                  Home
                </Link>
              </li>
              <li>/</li>
              <li className="font-medium text-stone-900 capitalize">{page.title}</li>
            </ol>
          </nav>

          <header className="border-b border-stone-200/80 pb-6 mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#bf1e2e]">
              <ShieldCheck size={13} />
              Calvin Official Document
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-stone-900">
              {page.title}
            </h1>
            {page.updated_at && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500">
                <Clock size={13} />
                Last updated on {page.updated_at.split("T")[0]}
              </p>
            )}
          </header>

          {/* Formatted Page Content */}
          <article className="prose prose-stone max-w-none text-sm sm:text-base leading-relaxed space-y-5 text-stone-700">
            {page.content.split("\n\n").map((paragraph, idx) => (
              <p key={idx} className="whitespace-pre-line leading-7">
                {paragraph}
              </p>
            ))}
          </article>

          {/* Dedicated Contact Cards if Contact Page */}
          {isContact && (
            <section className="mt-12 grid gap-4 sm:grid-cols-2 pt-8 border-t border-stone-200/80">
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2.5 text-[#bf1e2e]">
                  <Phone size={18} />
                  <h3 className="font-bold text-sm text-stone-900">Telephone Helpline</h3>
                </div>
                <p className="mt-2 text-xs text-stone-500">Mon–Sat, 9:30 AM to 6:30 PM IST</p>
                <a
                  href="tel:+919876543210"
                  className="mt-2 inline-block font-bold text-sm text-stone-900 hover:text-[#bf1e2e]"
                >
                  +91 98765 43210
                </a>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2.5 text-[#bf1e2e]">
                  <MessageSquare size={18} />
                  <h3 className="font-bold text-sm text-stone-900">WhatsApp Direct</h3>
                </div>
                <p className="mt-2 text-xs text-stone-500">Fast assistance & video troubleshooting</p>
                <a
                  href="https://wa.me/919876543210"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-bold text-sm text-stone-900 hover:text-[#bf1e2e]"
                >
                  Chat on WhatsApp &rarr;
                </a>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2.5 text-[#bf1e2e]">
                  <Mail size={18} />
                  <h3 className="font-bold text-sm text-stone-900">Customer Care Email</h3>
                </div>
                <p className="mt-2 text-xs text-stone-500">Official inquiries & order questions</p>
                <a
                  href="mailto:care@calvinaatamaker.com"
                  className="mt-2 inline-block font-bold text-sm text-stone-900 hover:text-[#bf1e2e]"
                >
                  care@calvinaatamaker.com
                </a>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2.5 text-[#bf1e2e]">
                  <MapPin size={18} />
                  <h3 className="font-bold text-sm text-stone-900">Manufacturing Works</h3>
                </div>
                <p className="mt-2 text-xs text-stone-500">Engineering & Service Hub</p>
                <p className="mt-2 text-xs font-medium text-stone-800">
                  Plot 42, GIDC Engineering Zone, Ahmedabad, Gujarat 382445, India
                </p>
              </div>
            </section>
          )}

          <div className="mt-12 pt-6 border-t border-stone-200">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#bf1e2e] hover:underline"
            >
              <ArrowLeft size={13} />
              Return to Calvin Home
            </Link>
          </div>
        </main>
      </div>

      <StorefrontFooter />
    </div>
  );
}

