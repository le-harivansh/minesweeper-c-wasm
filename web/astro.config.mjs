// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// A stand-in for harivansh.dev, where the game will live: the same build
// settings, so the game is built and served here the way it will be there.
// MDX because the site's Lab entry mounts the game from an MDX file.
export default defineConfig({
  trailingSlash: 'never',
  build: {
    // As the site: /lab/minesweeper-in-wasm.html rather than /lab/minesweeper-in-wasm/index.html.
    format: 'file',
  },
  integrations: [mdx()],
  // The harness has one page.
  redirects: {
    '/': '/lab/minesweeper-in-wasm',
  },
});
