/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable sharp for image processing
  images: {
    unoptimized: true,
  },
  // Ensure sharp works in serverless
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;

