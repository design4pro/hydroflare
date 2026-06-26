// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Production origin — drives sitemap + canonical URLs. Override per-env
  // via PUBLIC_SITE_URL at build time.
  site: process.env.PUBLIC_SITE_URL || 'https://hydroflare.workers.dev',
  // SSR by default; Home/editorial opt in via `export const prerender = true`.
  // See PLANS.md §5 "Rendering & caching (per route, hybrid)".
  output: 'server',
  // 'compile' transforms local/prerendered images at build time (free, via sharp)
  // and uses passthrough at runtime — avoids the Cloudflare Images binding
  // (paid). Product imagery is Shopify CDN via <ShopifyImage>, not astro:assets.
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
