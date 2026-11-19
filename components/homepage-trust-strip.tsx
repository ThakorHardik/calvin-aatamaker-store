import {
  BadgeCheck,
  Heart,
  SlidersHorizontal,
  Truck,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface HomepageTrustStripProps {
  content?: Record<string, unknown>;
}

type TrustItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const defaultHighlights: TrustItem[] = [
  {
    icon: BadgeCheck,
    title: "Carefully considered",
    description: "Design for everyday living",
  },
  {
    icon: SlidersHorizontal,
    title: "Made personal",
    description: "Bespoke panel customization",
  },
  {
    icon: Truck,
    title: "Order with confidence",
    description: "Safe doorstep delivery",
  },
  {
    icon: Heart,
    title: "Made for your home",
    description: "Everyday kitchen essentials",
  },
];

export default function HomepageTrustStrip({ content }: HomepageTrustStripProps = {}) {
  // If content with custom badges is supplied from CMS, render dynamic highlights
  let items: TrustItem[] = defaultHighlights;

  if (content && (content.badge1 || content.badge2 || content.badge3 || content.badge4)) {
    const icons: LucideIcon[] = [BadgeCheck, SlidersHorizontal, Truck, ShieldCheck];
    const customBadges: Array<{ title: string; description: string }> = [];

    for (let i = 1; i <= 4; i++) {
      const bKey = `badge${i}`;
      const badgeVal = content[bKey];
      if (typeof badgeVal === "string" && badgeVal.trim().length > 0) {
        customBadges.push({
          title: badgeVal.trim(),
          description:
            i === 1
              ? "Traditional stone milling"
              : i === 2
              ? "High-torque copper motor"
              : i === 3
              ? "Pan-India delivery"
              : "Official warranty",
        });
      }
    }

    if (customBadges.length > 0) {
      items = customBadges.map((badge, idx) => ({
        icon: icons[idx % icons.length],
        title: badge.title,
        description: badge.description,
      }));
    }
  }

  return (
    <section
      className="relative z-10 border-y border-[#EAE3D8] bg-[#FAF7F2] py-6 sm:py-8"
      aria-label="Store highlights"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4 lg:gap-8">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="group flex items-center gap-3.5 rounded-xl border border-transparent p-2 transition-all duration-200 hover:border-[#EAE3D8] hover:bg-white/60 sm:p-3"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE3D8] bg-white text-[#BD2031] shadow-[0_1px_3px_rgba(20,18,17,0.04)] transition-colors duration-200 group-hover:border-[#D9B88F] group-hover:text-[#BD2031] sm:h-11 sm:w-11"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>

                <div className="min-w-0 flex-1">
                  <strong className="block truncate font-display text-xs font-bold tracking-tight text-[#141211] sm:text-sm">
                    {item.title}
                  </strong>
                  <span className="mt-0.5 block truncate text-[11px] leading-snug text-[#5E5854] sm:text-xs">
                    {item.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
