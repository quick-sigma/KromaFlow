# Resize Processor

**Date**: 2026-07-02  
**Author**: OpenCode agent  
**Branches**: `feature/resize-processor`, `feature/resize-improvements`

## Summary

Added a **Resize** processor step that allows users to rescale images to any resolution directly from the pipeline editor. The step includes a dropdown selector with common display resolutions (4K, QHD, Full HD, HD, etc.) plus a "Custom" option for arbitrary width/height.

The step is **repeatable** — it can appear multiple times in the same pipeline (e.g. first shrink to an intermediate size, then to the final size).

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `Backend/resize_step.py` | Full implementation: `ResizeConfig`, `ResizeProcessor`, `ResizeStep` |
| `Backend/tests/test_resize_step.py` | 50 tests covering config validation, all 3 modes, edge cases, registration, repeatability, and pipeline integration |

### Modified Files

| File | Change |
|------|--------|
| `Backend/step.py` | Added `repeatable` field to `StepInfo` and `Step.__init__`, included in `info()`. `Pipeline.execute()` supports list-based configs for repeatable steps |
| `Backend/main.py` | Config building now uses lists when same step_id appears multiple times (for repeatable steps) |
| `Backend/steps_config.py` | Added `import resize_step` to trigger `@register` decorator |
| `frontend/src/stores/steps.ts` | Added `repeatable?: boolean` to `StepInfo` type |
| `frontend/src/stores/pipeline.ts` | Added `repeatable?: boolean` to `PipelineStep.step` type |
| `frontend/src/components/PipelineEditor.tsx` | Skip duplicate-step guard for repeatable steps; don't exclude repeatable step IDs from search |
| `frontend/src/components/StepSearch.tsx` | Repeatable steps are never excluded by ID from search results |
| `frontend/src/i18n/locales/en.json` | Resize field translations, removed `background_color` |
| `frontend/src/i18n/locales/es.json` | Spanish translations, removed `background_color` |

## Design

### Configuration (`ResizeConfig`)

| Field | Type | UI | Default | Description |
|-------|------|-----|---------|-------------|
| `preset` | `Literal[...]` | dropdown | `"1920x1080"` | 10 options: custom + 9 presets |
| `width` | `int` (1..76800) | number input | `1920` | Used when preset = "custom" |
| `height` | `int` (1..76800) | number input | `1080` | Used when preset = "custom" |
| `mode` | `Literal["fit","fill","stretch"]` | radiogroup | `"fit"` | Resize strategy |

Note: `background_color` was intentionally removed — background/padding is not a resize feature.

### Resolution Presets

- `custom` — uses width/height fields
- `3840x2160` — 4K UHD
- `2560x1440` — QHD
- `1920x1080` — Full HD (default)
- `1600x900` — HD+
- `1366x768` — common laptop
- `1280x720` — HD
- `1024x768` — XGA
- `800x600` — SVGA
- `640x480` — VGA

### Resize Modes

| Mode | Behaviour |
|------|-----------|
| **Fit** | Scale to fit *within* the target box (aspect ratio preserved). Both upscale and downscale supported. No padding added. |
| **Fill** | Scale to *cover* the target box (aspect ratio preserved); overflow cropped from centre |
| **Stretch** | Scale to exact target dimensions (aspect ratio not preserved) |

### Processor Logic (`ResizeProcessor`)

- Implements `base.Processor` ABC
- Uses `PIL.Image.Resampling.LANCZOS` for high-quality resampling
- **Fit**: calculates `min(target_w / src_w, target_h / src_h)` scale factor, then resizes (both up and down)
- **Fill**: scales to cover, centre-crops to target
- **Stretch**: direct resize to target dimensions
- Always copies the input image before mutating
- RGBA images keep their alpha channel in all modes (no compositing)

### Validation

- `preset` field uses a `Literal` type with all 10 options → Pydantic validates at the API boundary
- `width`/`height` constrained to `>= 1` via `Field(ge=1)`
- `mode` uses `Literal["fit", "fill", "stretch"]`

### Repeatable Step Support

The `StepInfo` and `Step` classes now support a `repeatable: bool` flag:

- **Backend**: `Pipeline.execute()` checks if a config value is a list (for repeatable steps) and pops entries in order. `main.py` builds list configs when the same step_id appears multiple times.
- **Frontend**: `PipelineEditor.handleSelect()` skips the duplicate-ID guard for repeatable steps. `excludeStepIds` filter excludes repeatable steps. `StepSearch.visibleSteps` does not filter out repeatable steps by ID.

## Tests

50 tests across 8 test classes:

- **TestResizeConfig** (11): defaults, validation, custom values, JSON schema frontend hints, confirmation that `background_color` is not present
- **TestProcessorStretch** (6): stretch to larger/smaller, aspect ratio warping, presets, RGBA
- **TestProcessorFill** (5): exact ratio, wide/tall sources, presets, no background leak
- **TestProcessorFit** (7): same ratio, wide/tall sources, upscale, RGBA, no padding
- **TestProcessorEdgeCases** (9): no config, None config, preset resolution, unknown preset fallback, copy safety, fill/stretch produce exact size, fit preserves ratio, presets validation
- **TestRegistration** (5): id map, registry, step info, repeatable flag, has repeatable field
- **TestInstantiation** (2): step creation, processor component
- **TestPipelineIntegration** (4): resize → formatter, **multiple resize steps**, resize → upscaler, no config

## Registration

The step is registered as:
- **ID**: `"resize"`
- **Name**: `"Resize"`
- **Variant**: `PROCESSOR`
- **Version**: `"1.0.0"`
- **Repeatable**: `true`

Available unconditionally (pure Pillow dependency, no model loading required).
