import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBranchEnvIntoProcess } from './scripts/load-branch-env.mjs';
import { nextClientEnvBlock } from './scripts/public-env.mjs';

loadBranchEnvIntoProcess();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: nextClientEnvBlock(),
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@features': path.resolve(__dirname, './src/features'),
      '@config': path.resolve(__dirname, './src/config'),
    };
    return config;
  },
};

export default nextConfig;
