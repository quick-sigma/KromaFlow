# Fix: Distribution nodes must respect output format

Date: 2026-07-03

## Problem

Los constraints de distribución no se estaban cumpliendo:

1. **SRCSet Distribution** — siempre devolvía imágenes en formato PNG sin importar el nodo de salida configurado. El formato `"ico"` no estaba soportado en `_resolve_format()` ni en `_FORMAT_MIME`, por lo que caía a PNG con un warning.

2. **Favicon Distribution** — ignoraba completamente el parámetro `output_format` y siempre codificaba como PNG (según su documentación: *"Ignored — favicons are always generated as PNG"*), cuando debería respetar el formato de salida como cualquier otro nodo de distribución.

## Root Cause

Ambos nodos de distribución (`SRCSetDistributionNode` y `FaviconDistributionNode`) no seguían el principio de que **la distribución solo debe redimensionar y empaquetar, nunca convertir de un formato a otro**. El formato de salida debe venir del formatter configurado en el pipeline.

## Cambios realizados

### 1. `srcset_distribution.py` — SRCSet Distribution

- **`_FORMAT_MIME`**: Añadido `"ico": "image/x-icon"` al mapa de formatos.
- **`_resolve_format()`**: Añadido `"ico": ("ICO", ".ico")` al mapa de extensiones.
- **`_prepare_for_format()`**: Nuevo método estático que convierte el modo de la imagen para ser compatible con el formato PIL destino. JPEG no soporta alpha, así que compone RGBA sobre fondo blanco. Todos los demás formatos (PNG, WEBP, AVIF, ICO, GIF) soportan alpha nativamente.
- **Ciclo de distribución**: Ahora usa `_prepare_for_format()` antes de guardar cada variante.

### 2. `favicon_distribution.py` — Favicon Distribution

- **`_FORMAT_MIME`**: Expandido para incluir todos los formatos (`png`, `ico`, `jpeg`, `jpg`, `webp`, `avif`, `gif`).
- **`distribute()`**: 
  - Ya no ignora `output_format`. Ahora lo usa para determinar el formato PIL y la extensión de archivo.
  - Ahora incluye `"format"` y `"quality"` en el resultado.
  - Usa `quality` para formatos lossy (JPEG, WEBP, AVIF).
- **`_resolve_format()`**: Nuevo método estático que mapea formatos de texto a `(pil_format, extension)`.
- **`_prepare_for_format()`**: Nuevo método estático para compatibilidad de modo de imagen (igual que en SRCSet).
- **`_make_filename()`**: Ahora acepta `ext` como parámetro en lugar de hardcodear `.png` o `.ico`.
- **`_generate_webmanifest()`**: Usa `mime_type` del artifact en lugar de hardcodear `"image/png"`.
- **`_generate_link_tags()`**: Usa `mime_type` del artifact en lugar de comprobar extensión de archivo.

### 3. Tests actualizados

- **`test_srcset_distribution.py`**: Añadido `"ico"` al test de resolución de formatos.
- **`test_favicon_distribution.py`**: 
  - Renombrados y actualizados tests de naming convention para probar tanto PNG como ICO.
  - Añadido `test_format_resolution` para verificar múltiples formatos.
  - Añadido `test_webmanifest_excludes_ico_when_output_is_ico`.
  - Actualizado `test_distribute_returns_dict` para verificar la clave `"format"`.

### 4. `output_suffix` — Sufijo para nombres de archivo de salida

- **`srcset_distribution.py`**: Añadido `"output_suffix": "srcset"` al resultado de `distribute()`.
- **`favicon_distribution.py`**: Añadido `"output_suffix": "favicon"` al resultado de `distribute()`.
- **`main.py`**: 
  - Almacena `outputSuffix` en la metadata de distribución (`dist_meta`).
  - Usa `outputSuffix` para construir el nombre del archivo: `{stem}-{suffix}.zip`.
- **`queue_manager.py`**: 
  - Usa `output_suffix` del primer resultado de distribución para construir el nombre: `{stem}-{suffix}.zip`.
  - Incluye `outputSuffix` en la metadata del WebSocket.

### 5. Tests actualizados (output_suffix)

- **`test_srcset_distribution.py`**: Verifica `output_suffix == "srcset"` en el resultado.
- **`test_favicon_distribution.py`**: Verifica `output_suffix == "favicon"` en el resultado.

## Resultado

Todos los 401 tests pasan correctamente.

## Principio

Los nodos de distribución tienen una única responsabilidad: **redimensionar y empaquetar archivos**. El formato de codificación lo determina exclusivamente el nodo formatter de salida del pipeline. La distribución no debe convertir formatos, solo preservar el que recibe.

Cada tipo de distribución expone un `output_suffix` que identifica el tipo (`"srcset"`, `"favicon"`) para que los consumidores (API, WebSocket) puedan construir nombres de archivo descriptivos como `logo-srcset.zip` o `logo-favicon.zip`.
