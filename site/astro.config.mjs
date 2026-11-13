// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL / BASE_PATH vêm do workflow de deploy (ex.: github.io/farmacia/novo) ou do domínio .com.br
export default defineConfig({
  site: process.env.SITE_URL || 'https://henriquecoan-code.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
