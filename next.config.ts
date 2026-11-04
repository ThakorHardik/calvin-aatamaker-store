import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jxveftfkpmzevjimxzce.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/product-media/**",
      },
      {
        protocol: "https",
        hostname: "jxveftfkpmzevjimxzce.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/banner-media/**",
      },
      {
        protocol: "https",
        hostname: "jxveftfkpmzevjimxzce.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/product-3d-models/**",
      },
      {
        protocol: "https",
        hostname: "jxveftfkpmzevjimxzce.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/customer-customizations/**",
      },
    ],
  },
};

export default nextConfig;
