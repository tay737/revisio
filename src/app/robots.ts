import type { MetadataRoute } from 'next';

/**
 * Crawlers get the public surface: landing, subject pages, legal pages.
 * Everything behind sign-in (/dashboard, /review, /learn…) and every API
 * route is disallowed — auth walls burn crawl budget and can leak URL shape.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/subjects', '/privacy', '/terms', '/cookie-policy', '/accessibility'],
      disallow: ['/api/', '/dashboard', '/review', '/learn', '/progress', '/library', '/settings', '/teacher', '/admin', '/staff', '/join'],
    },
    sitemap: '/sitemap.xml',
  };
}
