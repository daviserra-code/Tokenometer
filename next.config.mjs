/** @type {import('next').NextConfig} */
const allowedOrigins =
  process.env.SERVER_ACTION_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? ["localhost:3000"];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins }
  }
};

export default nextConfig;
