import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@features': path.resolve(__dirname, './src/features'),
      '@config': path.resolve(__dirname, './src/config'),
    };
    // `import x from './file.svg?raw'` gives the file's text (see src/brand.jsx).
    // Next's image loader would otherwise turn it into an image object.
    const imageRule = config.module.rules.find((r) => r.test?.test?.('.svg'));
    if (imageRule) {
      imageRule.resourceQuery = { not: [...(imageRule.resourceQuery?.not || []), /raw/] };
    }
    config.module.rules.push({ resourceQuery: /raw/, type: 'asset/source' });
    return config;
  },
};

export default nextConfig;
