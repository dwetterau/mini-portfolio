/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Externalize native modules for Turbopack compatibility
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
