import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { themeColor } from './scripts/theme-tokens.ts';

const BASE = '/kobo-annotations/';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ');

// Build-only: the dev server injects inline styles and scripts that this policy would block.
const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
  manifest: {
    id: BASE,
    name: 'Kobo Annotations',
    short_name: 'Kobo Annotations',
    description: 'Export your Kobo highlights to CSV, entirely in your browser.',
    lang: 'en',
    start_url: BASE,
    scope: BASE,
    display: 'standalone',
    theme_color: themeColor('color-primary'),
    background_color: themeColor('color-bg'),
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: 'icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{html,js,css,wasm,woff2}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    cleanupOutdatedCaches: true,
  },
});

export default defineConfig({
  base: BASE,
  plugins: [preact(), cspMeta(), pwa],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
