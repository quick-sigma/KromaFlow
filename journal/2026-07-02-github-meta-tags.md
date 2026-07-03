# GitHub Social Meta Tags Configuration

**Date:** 2026-07-02

## Summary

Added comprehensive Open Graph and Twitter Card meta tags to KromaFlow's `frontend/index.html` for rich social previews when the repository link is shared. Also updated README placeholders to point to the actual GitHub repository (`quick-sigma/KromaFlow`) and prepared the OG image asset for public access via raw GitHub URL.

## Changes

### New files
- `frontend/public/og-image.png` — Copy of `Logo/meta-image.png` for static serving via the app

### Modified files
- `frontend/index.html` — Added Open Graph and Twitter Card meta tags, theme-color meta, and updated title
- `README.md` — Updated placeholder URLs from `your-org/kromaflow` to `quick-sigma/KromaFlow`

## Details

### Meta tags added to `frontend/index.html`

**Open Graph (og:) tags:**
- `og:title` — "KromaFlow — Advanced Image Pipeline Engine"
- `og:description` — Pipeline editor summary
- `og:image` — Raw GitHub URL of `Logo/meta-image.png` (1280×423)
- `og:image:width` / `og:image:height` — 1280 × 423
- `og:url` — `https://github.com/quick-sigma/KromaFlow`
- `og:type` — `website`
- `og:site_name` — "KromaFlow"
- `og:locale` — `en_US`

**Twitter Card tags:**
- `twitter:card` — `summary_large_image` (large image preview)
- `twitter:title` — Same as og:title
- `twitter:description` — Same as og:description
- `twitter:image` — Same raw GitHub URL

**Additional:**
- `theme-color` meta set to `#662c91` (brand purple)
- Title updated from "KromaFlow — Image processing pipeline" to "KromaFlow — Advanced Image Pipeline Engine" for consistency with README

### Image asset
- `Logo/meta-image.png` (1280×423) is used as the OG image, accessible at the raw GitHub URL once pushed
- A copy exists at `frontend/public/og-image.png` for local static serving via Vite

### README
- Clone URL updated: `https://github.com/quick-sigma/KromaFlow.git`
- Bug report / feature request links updated to `quick-sigma/KromaFlow/issues`

## Testing

- Visual inspection of `frontend/index.html` — all meta tags present and properly formatted
- The image `frontend/public/og-image.png` exists (664KB, 1280×423)
- The OG image URL will resolve once the repo is pushed to `quick-sigma/KromaFlow` on GitHub
