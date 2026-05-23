import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile shared workspace packages from source (no prebuild step needed).
  transpilePackages: ['@dinoverse/ui', '@dinoverse/types', '@dinoverse/db'],
};

export default nextConfig;
