/* next.config.js */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export to generate HTML files for all pages, including error pages
  output: 'export',
  // Optional: ensure clean URLs without .html extensions
  // trailingSlash: false,
  // Optional: disable image optimization for static export
  // images: { unoptimized: true },
}
module.exports = nextConfig;
