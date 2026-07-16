/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Playwright and its stealth plugin must stay external to the server bundle.
    serverComponentsExternalPackages: [
      "playwright",
      "playwright-extra",
      "puppeteer-extra-plugin-stealth",
    ],
  },
};

export default nextConfig;
