# VaultSpark Studios Deployment Standard

This is a local copy of the studio-wide standard. The canonical version lives in the studio site repo.

See `gridiron-gm/docs/STUDIO_DEPLOYMENT_STANDARD.md` for the full text.

## This game's deployment config

- Slug: `gridiron-gm-play`
- Public URL: `https://vaultsparkstudios.com/gridiron-gm-play/`
- GitHub repo: `VaultSparkStudios/gridiron-gm-play`
- Pages source: GitHub Actions (`deploy-pages.yml`)
- Build command: `npm run build:pages`
- Vite base: `process.env.VITE_APP_BASE_PATH || '/gridiron-gm-play/'`
- SPA fallback: `scripts/postbuild-pages.mjs` copies `index.html` → `404.html`
- Backend: None (localStorage bridge to companion repo only)

## Required env vars (CI)

```
VITE_APP_BASE_PATH=/gridiron-gm-play/
VITE_CANONICAL_URL=https://vaultsparkstudios.com/gridiron-gm-play/
```

## Dual-repo note

This game has a companion repo (`gridiron-gm`). Both repos deploy independently but form one product. Do not merge them into one repo. Keep the localStorage bridge as the only coupling between the two deployments.

## Key Studio OS rules (summary)

- one repo per game, lowercase hyphenated slug
- slug stable once launched
- GitHub Pages from GitHub Actions (not branch publish)
- SPA 404.html fallback required
- no hardcoded `/` as production root
- every game repo self-sufficient (no reliance on studio site for deployment knowledge)
