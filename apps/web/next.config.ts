import type { NextConfig } from "next";

const config = {
  output: "export",
  // Hosted builds must not replace the files served by the local preview.
  distDir: process.env.FAMSYNC_LOCAL_PREVIEW === "1" ? "out-local" : ".next",
  trailingSlash: true,
  transpilePackages: ["@famsync/api-client"],
} satisfies NextConfig;

export default config;
