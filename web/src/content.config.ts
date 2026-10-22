import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * The site's `lab` collection, trimmed to what the stand-in entry needs. The
 * pattern takes MDX as well as Markdown: the game is mounted from MDX.
 */
const lab = defineCollection({
  loader: glob({ base: './src/content/lab', pattern: '**/[^_]*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { lab };
