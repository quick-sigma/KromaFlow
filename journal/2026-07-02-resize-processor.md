# Resize Processor

**Date**: 2026-07-02  
**Author**: OpenCode agent  
**Branch**: `feature/resize-processor`

## Summary

Added a **Resize** processor step that allows users to rescale images to any resolution directly from the pipeline editor. The step includes a dropdown selector with common display resolutions (4K, QHD, Full HD, HD, etc.) plus a "Custom" option for arbitrary width/height.

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `Backend/resize_step.py` | Full implementation: `ResizeConfig`, `ResizeProcessor`, `ResizeStep` |
| `Backend/tests/test_resize_step.py` | 53 tests covering config validation, all 3 modes, edge cases, registration, and pipeline integration |

### Modified Files

| File | Change |
|------|--------|
| `Backend/steps_config.py` | Added `import resize_step` to trigger `@register` decorator |
| `frontend/src/i18n/locales/en.json` | Added `resize` field translations (title/description for preset, width, height, mode, background_color) |
| `frontend/src/i18n/locales/es.json` | Spanish translations for all resize step fields |

## Design

### Configuration (`ResizeConfig`)

| Field | Type | UI | Default | Description |
|-------|------|-----|---------|-------------|
| `preset` | `Literal[...]` | dropdown | `"1920x1080"` | 10 options: custom + 9 presets |
| `width` | `int` (1..76800) | number input | `1920` | Used when preset = "custom" |
| `height` | `int` (1..76800) | number input | `1080` | Used when preset = "custom" |
| `mode` | `Literal["fit","fill","stretch"]` | radiogroup | `"fit"` | Resize strategy |
| `background_color` | `str` | text input | `"#000000"` | Padding colour for "fit" mode |

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
| **Fit** | Scale to fit *within* the target box (aspect ratio preserved); leftover area filled with `background_color` |
| **Fill** | Scale to *cover* the target box (aspect ratio preserved); overflow cropped from centre |
| **Stretch** | Scale to exact target dimensions (aspect ratio not preserved) |

### Processor Logic (`ResizeProcessor`)

- Implements `base.Processor` ABC
- Uses `PIL.Image.Resampling.LANCZOS` for high-quality resampling
- Handles RGBA images correctly: alpha channel preserved in stretch/fill; composited onto background in fit mode
- `thumbnail()` for downscaling in fit mode (only shrinks, never enlarges)
- Always copies the input image before mutating

### Validation

- `preset` field uses a `Literal` type with all 10 options → Pydantic validates at the API boundary
- `width`/`height` constrained to `>= 1` via `Field(ge=1)`
- `mode` uses `Literal["fit", "fill", "stretch"]`
- `background_color` parsed by `_parse_hex_color()` helper with error handling for invalid hex strings

## Tests

53 tests across 7 test classes:

- **TestParseHexColor** (7): hex parsing with/without `#`, invalid inputs
- **TestResizeConfig** (12): defaults, validation, custom values, JSON schema frontend hints
- **TestProcessorStretch** (6): stretch to larger/smaller, aspect ratio warping, presets, RGBA
- **TestProcessorFill** (5): exact ratio, wide/tall sources, presets, no padding
- **TestProcessorFit** (6): same ratio, wide/tall + padding, small image, RGBA, default background
- **TestProcessorEdgeCases** (8): no config, None config, preset resolution, unknown preset fallback, copy safety, all modes parametrized, presets validation
- **TestRegistration** (3): id map, registry, step info
- **TestInstantiation** (2): step creation, processor component
- **TestPipelineIntegration** (3): resize → formatter, resize → upscaler, no config

## Registration

The step is registered as:
- **ID**: `"resize"`
- **Name**: `"Resize"`
- **Variant**: `PROCESSOR`
- **Version**: `"1.0.0"`

Available unconditionally (pure Pillow dependency, no model loading required).
