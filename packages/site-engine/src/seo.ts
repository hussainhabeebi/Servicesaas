/** Auto-SEO (spec §8): sitemap.xml generated from the tenant's live site sections; submission to Search Console happens on domain verification (see app/routes/domains.ts). */
export function renderSitemap(host: string, sections: string[]): string {
  const urls = ["", ...sections.map((s) => `#${s}`)];
  const entries = urls
    .map(
      (path) => `  <url><loc>https://${host}/${path}</loc><changefreq>weekly</changefreq></url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export function renderRobotsTxt(host: string): string {
  return `User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`;
}

/** Marketing domain has fixed pages (no tenant/site row to read sections from). */
export function renderMarketingSitemap(rootDomain: string): string {
  const paths = ["", "privacy", "terms"];
  const entries = paths
    .map((path) => `  <url><loc>https://${rootDomain}/${path}</loc><changefreq>weekly</changefreq></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}
