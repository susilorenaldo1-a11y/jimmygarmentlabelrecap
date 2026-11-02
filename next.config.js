/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist", "google-spreadsheet"],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), "canvas"];
    return config;
  },
};

module.exports = nextConfig;
