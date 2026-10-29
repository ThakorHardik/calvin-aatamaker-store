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
    ],
  },
};

export default nextConfig;
