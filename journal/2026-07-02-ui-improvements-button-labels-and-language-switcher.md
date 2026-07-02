# UI Improvements: Button Labels & Language Switcher

## Summary
Updated button labels for clarity and added a language switcher to toggle between English and Spanish.

## Changes

### Translation updates
- **en.json**: `addStep` → `"New Step"` (was `"Add New Step"`), `save` → `"Save"` (was `"Save Pipeline"`)
- **es.json**: `addStep` → `"Nuevo Paso"` (was `"Agregar Paso"`), `save` → `"Guardar"` (was `"Guardar Pipeline"`)

### PipelineEditor.tsx
- Added `FiPlus` icon from `react-icons/fi` before the "New Step" button text, with a `flex items-center justify-center gap-2` layout
- Added a language switcher button in the header area using `FiGlobe` icon + current language code (`EN`/`ES`)
  - Toggles between `'en'` and `'es'` via `i18n.changeLanguage()`
  - Styled consistently with the existing theme (hover transitions, muted text color)

### Test updates (PipelineEditor.test.tsx)
- All `getByRole('button', { name: 'Add New Step' })` → `'New Step'`
- All `getByRole('button', { name: 'Save Pipeline' })` → `'Save'`
- Fixed 3 tests where both the pipeline-level "Save" and dialog-level "Save" buttons collided by scoping with `within()`

## Files Modified
- `frontend/src/i18n/locales/en.json`
- `frontend/src/i18n/locales/es.json`
- `frontend/src/components/PipelineEditor.tsx`
- `frontend/src/components/PipelineEditor.test.tsx`

## Test Results
All 205 tests pass across 14 test files.
