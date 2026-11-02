/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["google-spreadsheet", "google-auth-library", "unpdf"],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), "canvas"];
    return config;
  },
};

module.exports = nextConfig;
