import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components dimatikan: semua halaman membaca sesi pengguna per permintaan (D-17).
  cacheComponents: false,
  experimental: {
    serverActions: {
      // cadangan JSON app lama bisa lebih dari 1 MB jika transaksinya banyak
      bodySizeLimit: "5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
