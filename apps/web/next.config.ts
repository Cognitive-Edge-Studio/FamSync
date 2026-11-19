import type { NextConfig } from "next";

const config = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@famsync/api-client"],
} satisfies NextConfig;

export default config;
