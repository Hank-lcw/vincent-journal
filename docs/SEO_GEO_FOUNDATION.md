# VINCENT JOURNAL — SEO & GEO Foundation

## Implemented

- `/robots.txt` permits ordinary public pages and disallows the Studio and admin API.
- `/sitemap.xml` is generated from **published D1 articles only** (up to 1,000 most recent articles), with canonical URLs and modified dates. Drafts and demo-only articles are excluded.
- The existing `/article.html?id=<slug>` article route keeps the current UI and client rendering, but now **returns the article's sanitized body, metadata and BlogPosting JSON-LD in the initial HTML**. No new article permalink or broken legacy links.
- `/about/vincent-lin` is a permanent public ProfilePage/Person entity URL for 林哲緯 / Vincent Lin / Che-Wei Lin. It describes current status as a medical student and content creator, not a licensed practicing physician.
- Article author attribution is opt-in and stored in D1. Existing articles have **no automatically assigned individual author**. When a real byline is set, it appears on the public article and structured data.
- VINCENT STUDIO article editor now exposes optional author name, SEO title and SEO description, using the existing API columns for SEO metadata.
- Main homepage and Discover page include descriptions and canonical links; private Studio includes `noindex,nofollow`.

## Production / QA

- New database migration: `migrations/0006_article_author_name.sql`.
- Cloudflare deployment workflow applies D1 migrations **before** deploying the Worker to avoid a missing column during rollout.
- Pull requests validate typecheck, QA, database migrations and Wrangler dry run; pull requests do **not** deploy production.
- Current configured canonical site: `https://vincent-journal.andyhank1234567890.workers.dev`. When changing to a custom domain, update `PUBLIC_BASE_URL` in `wrangler.jsonc` **and** canonical values in `public/index.html` and `public/discover.html`.

## Manual actions after deployment

1. Open `/robots.txt`, `/sitemap.xml`, `/about/vincent-lin`, and a published article's raw HTML. Confirm the response is not a Cloudflare Access challenge and that article content and JSON-LD are present without running JavaScript.
2. Add the site to Google Search Console. Verify domain ownership and submit the Sitemap URL. Ensure Google chose the same canonical and examine indexing problems before requesting reindexing.
3. Check Bing Webmaster Tools and inspect crawl access for OAI-SearchBot. No crawler access setting guarantees AI citations or recommendations.
4. Verify all bylines with the person credited. Do not publish fictitious credentials, case results, reviews, or clinic information.
5. Test representative informational questions monthly and track whether the site is cited, not only the volume of keyword mentions.

## Editorial / medical compliance

This phase is **medical knowledge publishing**, not advertising clinical services. No physician license or specialty designation is asserted. Prior to any future consultation, clinic profile, treatment cases, or promotional copy, confirm current Taiwan medical advertising and professional regulation requirements.

## Known limitations

- Article IDs that are not published D1 slugs still fall back to the legacy JavaScript-rendered page; they are **not included in the dynamic Sitemap**.
- The Sitemap lists up to 1,000 recent published articles; extend paging if the library grows past that threshold.
- The site does not currently provide a public analytics dashboard or AI-recommendation monitoring; Search Console and ongoing monitoring require account access and real-world measurement.
- Knowledge panels, AI citations, rich snippets and rankings are decided by search providers and cannot be guaranteed by structured data.
