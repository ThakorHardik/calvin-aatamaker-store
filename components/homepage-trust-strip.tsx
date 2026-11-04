import { BadgeCheck, Heart, SlidersHorizontal, Truck, ShieldCheck } from "lucide-react";

interface HomepageTrustStripProps {
  content?: Record<string, unknown>;
}

const defaultHighlights = [
  {
    icon: BadgeCheck,
    title: "Carefully considered",
    description: "Design for everyday living",
  },
  {
    icon: SlidersHorizontal,
    title: "Made personal",
    description: "Customisation is on the way",
  },
  {
    icon: Truck,
    title: "Order with confidence",
    description: "Clear order updates",
  },
  {
    icon: Heart,
    title: "Made for your home",
    description: "Everyday kitchen essentials",
  },
];

export default function HomepageTrustStrip({ content }: HomepageTrustStripProps = {}) {
  // If content with custom badges is supplied from CMS, render dynamic highlights
  let items = defaultHighlights;

  if (content && (content.badge1 || content.badge2 || content.badge3 || content.badge4)) {
    const icons = [BadgeCheck, SlidersHorizontal, Truck, ShieldCheck];
    const customBadges: Array<{ title: string; description: string }> = [];

    for (let i = 1; i <= 4; i++) {
      const bKey = `badge${i}`;
      const badgeVal = content[bKey];
      if (typeof badgeVal === "string" && badgeVal.trim().length > 0) {
        customBadges.push({
          title: badgeVal.trim(),
          description: i === 1 ? "Traditional stone milling" : i === 2 ? "High-torque copper motor" : i === 3 ? "Pan-India delivery" : "Official warranty",
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
    <section className="trust-strip" aria-label="Store highlights">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div className="trust-item" key={item.title}>
            <span className="trust-icon">
              <Icon size={20} />
            </span>

            <div>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
