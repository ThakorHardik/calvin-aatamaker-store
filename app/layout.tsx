import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calvin Aatamaker | Fresh flour, made at home",
  description:
    "Explore home aatamakers by Calvin. Discover compact design and personalised flour milling for your kitchen.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
