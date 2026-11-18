import type { MetadataRoute } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { subjects } from '@/db/schema';

/**
 * Sitemap — the indexable surface only.
 *
 * App routes behind sign-in are deliberately absent: they are not content a
 * crawler should index, and listing them would invite crawl budget spent on
 * login walls. Public profiles (/u/…) are also excluded — they are shared
 * links, not search destinations; subjects are the pages meant to rank.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://revisio-srs.vercel.app';

  const subjectRows = await db
    .select({ slug: subjects.slug })
    .from(subjects)
    .where(isNull(subjects.ownerId));

  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/subjects`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/for-teachers`, changeFrequency: 'monthly', priority: 0.7 },
    ...subjectRows.map((s) => ({
      url: `${base}/subjects/${s.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/cookie-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/accessibility`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/what-we-dont-do`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
