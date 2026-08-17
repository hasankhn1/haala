/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source (no build step), so Next has to
  // compile them itself.
  transpilePackages: ['@haala/design-tokens'],
  images: { remotePatterns: [{ protocol: 'https', hostname: 'upload.wikimedia.org' }] },
};
export default nextConfig;
