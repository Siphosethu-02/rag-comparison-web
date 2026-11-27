/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin is server-only; keep it out of the client/edge bundle.
  experimental: {
    serverComponentsExternalPackages: ["firebase-admin", "pdfjs-dist"],
  },
};
module.exports = nextConfig;
