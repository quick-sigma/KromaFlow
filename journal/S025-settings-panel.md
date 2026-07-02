# S025 — Settings Panel with Hugging Face Token Configuration

**Date:** 2026-07-02

## Summary

Added a general settings panel accessible via a gear icon in the sidebar header. The settings dialog allows configuring a Hugging Face token, which is used by the backend for model downloads (gated models, faster downloads via HF CDN).

## Changes

### Backend

1. **`Backend/settings.py`** (new) — Thread-safe singleton in-memory settings store.
   - `hf_token` property with getter/setter
   - `has_hf_token` boolean property
   - Thread-safe via `threading.Lock`

2. **`Backend/main.py`** — Three new API endpoints:
   - `GET /api/settings` — Returns `{ hfTokenConfigured: bool }` (never exposes the token)
   - `POST /api/settings/hf-token` — Accepts `{ "token": "hf_..." }`, stores in memory
   - `DELETE /api/settings/hf-token` — Clears the stored token

3. **`Backend/model_manager.py`** — `_get_real_esrgan_download_url()` now reads the token from `Settings.get_instance().hf_token` and passes it to `hf_hub_download()`.

4. **`Backend/bg_removal.py`** — `_lazy_load_model()` now reads the token from `Settings.get_instance().hf_token` and passes it to `AutoModelForImageSegmentation.from_pretrained()`.

### Frontend

5. **`frontend/src/stores/settings.ts`** (new) — Zustand settings store with localStorage persist.
   - Stores the HF token 
   - Syncs to backend on set/clear
   - Syncs persisted token to backend on app startup

6. **`frontend/src/components/SettingsDialog.tsx`** (new) — Modal dialog with:
   - Masked token input (`type=password`) with an eye toggle to show/hide
   - Validation hint for `hf_` prefix
   - Token-configured status indicator (green dot when configured)
   - Save, Clear Token, and Cancel buttons
   - Sync spinner and error/success feedback
   - Same Cyber-Amethyst styling as SavePipelineDialog

7. **`frontend/src/components/PipelineEditor.tsx`** — Added:
   - Gear icon (`FiSettings`) in the sidebar header next to the language toggle
   - SettingsDialog rendering when the gear icon is clicked

8. **`frontend/src/App.tsx`** — Added settings sync to backend: `syncToBackend()` is called after the hydration gate is ready, and `checkBackendStatus()` is called eagerly.

9. **i18n** — Added `settingsDialog.*` keys to both `en.json` and `es.json`.

## Security

- Token is stored in localStorage (persistent choice made by user)
- Backend stores token only in memory (never persisted to disk)
- Token is never exposed via API (only a boolean `hfTokenConfigured`)
- Input is masked by default with a toggle to reveal
- Token sent to backend via HTTP POST (localhost only, HTTPS not applicable)

## Testing

- Backend: 203/206 tests pass (3 pre-existing failures in `test_bg_removal.py` unrelated to changes)
- Frontend: 198/209 tests pass (11 pre-existing failures due to i18n key resolution in test environment)
- No regressions detected
