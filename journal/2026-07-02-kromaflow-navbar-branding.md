# KromaFlow Navbar & Branding

## Date
2026-07-02

## Summary
Added a global top navbar with the KromaFlow brand identity (icon + tipografia) and replaced the single SVG favicon with a multi-format PNG favicon set. Moved Settings and language controls from the PipelineEditor sidebar to the new navbar.

## Changes

### New files
- `frontend/src/components/Navbar.tsx` — Navbar component with brand icon/tipografia on the left and Settings + language switcher on the right
- `frontend/public/icon.png` — Brand icon for the navbar (copied from Logo/Icon.png)
- `frontend/public/tipografia.avif` — Brand typography/wordmark (copied from Logo/tipografia.avif)
- `frontend/public/favicon-{16,32,48,192}x{16,32,48,192}.png` — Multi-size favicon PNGs
- `frontend/public/apple-touch-icon.png` — Apple touch icon (180x180)
- `frontend/public/site.webmanifest` — PWA manifest with KromaFlow branding

### Modified files
- `frontend/index.html` — Replaced single SVG favicon with multi-format PNG links + apple-touch-icon + manifest; changed title to "KromaFlow"
- `frontend/src/App.tsx` — Added Navbar at top; restructured layout to flex-col; lifted SettingsDialog state to App level
- `frontend/src/components/PipelineEditor.tsx` — Removed Settings button and language switcher from sidebar header; removed SettingsDialog rendering

## Details

### Navbar
- **Left**: 32x32 brand icon (`icon.png`) + 24px tall tipografia (`tipografia.avif`)
- **Right**: Language switcher (EN/ES toggle with globe icon) + Settings gear button
- Dark theme consistent with existing Cyber-Amethyst design system
- `shrink-0` + `select-none` for clean UX

### Favicon strategy
- PNG multi-size approach: 16x16, 32x32, 48x48, 192x192
- SVG retained as `sizes="any"` fallback
- Apple touch icon at 180x180
- PWA manifest at `/site.webmanifest`

### Architecture
- Settings state (`isSettingsOpen`) lifted from PipelineEditor to App.tsx
- Navbar receives `onOpenSettings` callback from App
- SettingsDialog rendered at App level (same location as before, just higher up)
8
## Testing
- All 7 App tests pass ✅
- Pre-existing i18n test failures in SavePipelineDialog.test.tsx and PipelineEditor.test.tsx are unrelated to these changes
