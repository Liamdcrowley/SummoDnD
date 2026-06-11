import type { NextConfig } from "next";

const repoBasePath = "/SummoDnD";
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.trim() ||
  (process.env.NODE_ENV === "production" ? repoBasePath : undefined);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
