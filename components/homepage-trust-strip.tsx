import { BadgeCheck, Heart, SlidersHorizontal, Truck } from "lucide-react";

const highlights = [
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

export default function HomepageTrustStrip() {
  return (
    <section className="trust-strip" aria-label="Store highlights">
      {highlights.map((item) => {
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
