/**
 * Resolves a `public/` asset against the deploy base.
 *
 * Vite rewrites `url()` inside CSS to respect `base`, but a path written as a
 * plain string in TypeScript is never parsed by the bundler — it ships verbatim.
 * A leading-slash literal like `/resources/skies.webp` therefore resolves against
 * the DOMAIN ROOT, which is correct on the dev server and wrong the moment the
 * site is served from a subpath (GitHub Pages project sites live at
 * `/<repo>/`). That was silent: the build succeeds and every photo 404s.
 *
 * `import.meta.env.BASE_URL` is whatever `base` is set to in `vite.config.ts`
 * (currently `'./'`), so this keeps working wherever the build is dropped —
 * domain root, a Pages subpath, or `file://` — without a rebuild.
 *
 * Relative resolution is only safe because the router uses HASH routes
 * (`#concept`), so the document path never changes under us. If routing ever
 * moves to real paths, switch `base` to an absolute `'/<repo>/'`; this helper
 * needs no change.
 *
 * A leading slash is accepted and stripped, so the call sites can keep writing
 * paths the way the dev server and the docs show them (`/resources/x.webp`).
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
