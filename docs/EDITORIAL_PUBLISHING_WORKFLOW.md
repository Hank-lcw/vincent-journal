# VINCENT JOURNAL — Editorial Production & Publishing Workflow
Status: review draft / UI phase 1. Inspired by the editorial clarity of fashion magazines, not a reproduction of any third-party brand.

## Brand and UX premise
VINCENT JOURNAL covers aesthetic medicine, aesthetics, fashion, health and longevity medicine. It is **not** Vincent Note (personal medicine/business/finance commentary). A visually refined editorial publication needs a simpler production workflow than its broad feature set suggests.

Editor journey: **Story → Visuals → Platform Editions → Evidence & Editorial Review → Release & Verify**.

This first iteration is **additive UI/interaction only**. It does not change Cloudflare Workers, D1 schema, R2 objects, existing editorial status models, OAuth, Meta publishing, Canva, newsletter flows, article revisions, permissions or audit logs.

## Existing capabilities confirmed from the repository
- Media Studio: original upload, AI image generation/edit, metadata, version families, 4:5 / 1:1 / 16:9 crops, visual compare, reference-protected deletion, media visibility.
- Social Studio: platform-specific copy, images (maximum 10), drag/touch-oriented ordering, first-image cover, storyboard, live platform mockup, scheduling, approvals and Canva Brand Templates.
- Publishing Center: separate approval and release actions for articles, issues, social drafts and newsletters.
- Platforms: Instagram, Facebook, Threads, and Xiaohongshu Ready-to-Publish handoff.

## Phase 1 applied in this PR
1. Add editorial workflow navigation at Media, Social and Publish sections (all point to existing controllers).
2. Put core media production **ahead of** unrelated fixed-site visual placements.
3. Add three editorial **visual direction briefs**. Clicking one appends non-destructively to the existing AI prompt and does not generate images.
4. Add non-destructive social **preflight hints** for title, copy, image count and preview availability. These do not replace editorial review.
5. Clearer multi-platform/publishing responsibilities and release checklist.
6. Use restrained editorial typography, warm neutral surfaces, mobile-responsive layout and accessible controls.

## Critical publication journey (future phase)
### 1. Intake / Story
Choose **source article**, **standalone social feature**, or **issue**. Title, section, author, sources, image permissions and publication intent stay linked to a draft across steps. Autosave is desirable but must not overwrite reviewed revisions or alter current audit semantics.

### 2. Visual editing
Media library is the source of truth. Never overwrite original. Versions are family-linked, crop metadata and platform target preserved. Cover Editor adds magazine masthead, section kicker, headline, subheading and contrast-safe overlays; text must remain editable and must not be burned into the original R2 object. Crop guide should include mobile safe areas and thumbnail preview. Photograph-led; no generic all-text card grids.

Editorial visual presets:
- **Portrait / Aesthetics**: human subjects, negative space, restrained lettering
- **Science / Longevity**: accurate, non-misleading illustration/macro studies
- **Culture / Style / Wellness**: editorial documentary/photo essays

### 3. Platform editions
One reusable story **source**, independent editions with their own:
- Platform and media_id order (first slide cover)
- Edition-specific caption, cover text, hashtags, CTA, scheduled time
- Separate preview and validation
- Canva layout link/ID if created
- Editorial and legal signoff state

Do not copy text identically to Instagram, Facebook, Threads or Xiaohongshu. Xiaohongshu needs Simplified Chinese localization, platform-native tone and compliant manual handoff unless supported authorization exists.

### 4. Preflight and review
Hard validation before approved scheduling, subject to server-side checks:
- Platform-required media and publication formats
- Source images with rights/usage metadata
- Text overflow, contrast, cover crop/safe-area and non-empty alt text
- Medical evidence citations and AI-assisted visual disclosure when appropriate
- No patient identifiers, unconsented portraits, misleading before-after, unsubstantiated outcomes
- Status and actor: draft → in_review → approved → scheduled/publishing → published/failed
- All versions audited. Review rejection preserves prior approved version and comments.

### 5. Release and verification
Website, email and each social edition must publish independently, and show explicit resulting status / error / URL / timestamp. **Never imply cross-channel release succeeded because the article did.** Retry only failed targets, with idempotency to avoid duplicate social posts. A scheduled post must not be labelled 'published' before confirmation. Retain manual publication instructions where APIs lack permissions.

## Mobile and accessibility
- 1-column cards and controls on narrow screens
- Clearly visible focus states
- No operation depends exclusively on drag and drop
- Avoid tiny headline text in IG grid thumbnail and provide legible 4:5 preview
- Respect reduced motion for all new animation
- Never use an uploaded asset as the backdrop of a destructive control

## Regression acceptance
- Previous media library search/filter/selection/parent families/crop/AI/edit/delete/visibility work unmodified.
- New workflow buttons switch using Studio's existing navigation, retaining role-gated behavior.
- Style brief click augments but does not overwrite existing prompt; no generation request until user submits.
- Social preflight reacts to changes of title, caption, platform and carousel.
- Social posts still require existing server-side validation, approvals, platform credentials and error handling.
- Canva/Meta/Xiaohongshu/Newsletter workflows remain intact.
- Public website and Vincent Note are untouched.

## Phase 2 (separate PR after user reviews workflow)
Implement actual WYSIWYG magazine cover compositor, editable font and placement presets, per-slide image typography, preview-to-render parity, mobile UX tests, asset licensing records, release channel matrix, detailed error recovery, and schedule calendar. Test locally and in Cloudflare staging before production deploy.
