# Pipeline Save/Load + Mobile hover fix

## Date
2026-07-02

## Summary
- Removed hover-dependent visibility of action buttons (configure/delete) in PipelineFlowGraph for mobile compatibility
- Added disabled styling to Button component
- Implemented pipeline save/load with localStorage persistence
- Added dropdown at top of Pipeline Editor to load saved pipelines
- Added Save button (disabled when no steps) alongside Add New Step button

## Changes

### 1. PipelineFlowGraph.tsx - Mobile hover fix
- Changed actions row from `opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200` to always-visible
- Removed `group` class from parent div (no longer needed)
- Actions (configure gear + delete trash icons) now always visible, making them accessible on mobile/touch devices

### 2. Button.tsx - Disabled state styling
- Added `disabled:bg-blue-600/40 disabled:cursor-not-allowed` to primary variant
- Added `disabled:bg-red-600/40 disabled:cursor-not-allowed` to danger variant
- Removed `cursor-pointer` from base styles (handled per-variant via the disabled pseudo-class)

### 3. PipelineEditor.tsx - Save/Load + Dropdown
New features:
- **Pipeline dropdown** at the top of the editor (between header and content area):
  - Shows "Load Pipeline…" by default
  - Opens a dropdown menu listing all saved pipelines from localStorage
  - Each saved pipeline entry has a delete button (X icon)
  - Selecting a pipeline loads it into the editor
  - Closes on click-outside (via ref-based event listener)
- **Save button** at the bottom, in a 2-column grid alongside Add New Step:
  - Disabled when `pipelineSteps.length === 0`
  - Saves current pipeline steps + name to localStorage
  - Auto-generates name ("Untitled Pipeline", "Untitled Pipeline 2", etc.) if empty
- **localStorage persistence** under key `pipeline-editor-saved`

State management:
- `pipelineName` - current pipeline display name
- `savedPipelines` - list of `SavedPipeline` objects from localStorage
- `dropdownOpen` - controls dropdown visibility
- `dropdownRef` - for click-outside detection

### 4. Locales (en.json / es.json)
New translation keys in `pipelineEditor`:
- `save`: "Save Pipeline" / "Guardar Pipeline"
- `loadPipeline`: "Load Pipeline…" / "Cargar Pipeline…"
- `noSavedPipelines`: "No saved pipelines yet." / "No hay pipelines guardados aún."
- `pipelineSaved`: "Pipeline saved successfully" / "Pipeline guardado exitosamente"
- `confirmDelete`: confirmation message for deleting saved pipeline
- `untitledPipeline`: "Untitled Pipeline" / "Pipeline sin título"

### 5. Tests
- Added `localStorage.clear()` to `beforeEach` for test isolation
- Added 7 new tests covering:
  - Save button disabled when no steps
  - Save button enabled after adding step
  - Save pipeline to localStorage
  - Load pipeline from localStorage
  - Delete saved pipeline from dropdown
  - Empty dropdown state message
  - Dropdown closes on click-outside
  - Save disabled after loading empty pipeline

## Files Modified
- `frontend/src/components/PipelineEditor.tsx` - Major rewrite with save/load/dropdown
- `frontend/src/components/PipelineFlowGraph.tsx` - Remove hover dependency
- `frontend/src/components/Button.tsx` - Add disabled styles
- `frontend/src/i18n/locales/en.json` - New translations
- `frontend/src/i18n/locales/es.json` - New translations
- `frontend/src/components/PipelineEditor.test.tsx` - New save/load tests

## Test Results
All 117 tests pass (12 test files).
