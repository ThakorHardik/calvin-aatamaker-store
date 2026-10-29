export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  image: string;
  dimensions: { height: string; width: string; depth: string };
  badge: string;
  customisable: boolean;
  active: boolean;
  stock: number;
};

// DEMO CONTENT ONLY. Replace this data with Supabase-backed product records before launch.
export const initialProducts: Product[] = [
  {
    id: "aat-001",
    name: "Compact Domestic Aatamaker",
    slug: "compact-domestic-aatamaker",
    category: "Compact range",
    description: "A space-conscious home flour mill concept for everyday fresh atta.",
    price: 18999,
    image: "/images/compact-atta-chakki.jpeg",
    dimensions: { height: "88 cm", width: "48 cm", depth: "34 cm" },
    badge: "Featured model",
    customisable: true,
    active: true,
    stock: 12,
  },
];

export const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
