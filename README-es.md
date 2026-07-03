# 🔮 KromaFlow — Motor Avanzado de Pipelines de Imagen

<p align="center">
  <img src="Logo/github-banner.png" alt="KromaFlow Banner" width="100%" style="border-radius: 8px;" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tema-Cyber--Amethyst-662c91?style=for-the-badge" alt="Tema" />
  <img src="https://img.shields.io/badge/Enfoque-Procesamiento--por--Lotes-f25f5c?style=for-the-badge" alt="Lotes" />
  <img src="https://img.shields.io/badge/Editor-Basado--en--Nodos-7261a3?style=for-the-badge" alt="Nodos" />
  <img src="https://img.shields.io/badge/Stack-Python%20%7C%20React-41b883?style=for-the-badge" alt="Stack" />
  <img src="https://img.shields.io/badge/IA-Real--ESRGAN%20%7C%20BRIA-ff6b6b?style=for-the-badge" alt="IA" />
</p>

<p align="center">
  <a href="README.md"><strong>🇬🇧 English version</strong></a>
</p>

---

## 📖 Instrucciones de instalación

> 🧭 **¿Buscas una guía de instalación paso a paso?**  
> Consulta [**INSTALLATION-es.md**](INSTALLATION-es.md) para instrucciones detalladas sobre cómo instalar KromaFlow en **Windows**, **Linux** y **macOS**, incluyendo dependencias del sistema, configuración de GPU y solución de problemas.
>
> 🇬🇧 Prefer English? See [**INSTALLATION.md**](INSTALLATION.md).

---

## 🌌 Visión General

**KromaFlow** es un conjunto de procesamiento de imágenes de vanguardia que te permite diseñar, visualizar y ejecutar pipelines de imagen complejos mediante un editor intuitivo de arrastrar y soltar. Carga tus archivos, encadena operaciones en segundos y procesa lotes masivos con precisión de píxel perfecto.

Ya seas un desarrollador automatizando pipelines de assets o un diseñador que necesita lotes de salida consistentes, KromaFlow te brinda el poder del procesamiento de imágenes de grado profesional — sin necesidad de complejos comandos de terminal.

---

## ⚡ Características Principales

<p align="center">
  <table>
    <tr>
      <td align="center" width="33%">🎛️</td>
      <td align="center" width="33%">🧠</td>
      <td align="center" width="33%">🧼</td>
    </tr>
    <tr>
      <td align="center"><strong>Editor de Pipeline</strong></td>
      <td align="center"><strong>Superresolución con IA</strong></td>
      <td align="center"><strong>Eliminación Inteligente de Marcas de Agua</strong></td>
    </tr>
    <tr>
      <td>Diseña tu flujo de trabajo visualmente — arrastra, suelta y reordena los pasos de procesamiento. Ajusta los parámetros en tiempo real antes de ejecutar.</td>
      <td>Amplía imágenes a HD usando redes neuronales <strong>Real-ESRGAN</strong>. Enfoque nítido, sin artefactos, incluso en texturas complejas.</td>
      <td>Detección avanzada de canal alfa y fusión inversa para eliminar limpiamente marcas de agua, logotipos y texto superpuesto.</td>
    </tr>
    <tr>
      <td align="center" width="33%">📦</td>
      <td align="center" width="33%">🖼️</td>
      <td align="center" width="33%">📊</td>
    </tr>
    <tr>
      <td align="center"><strong>Exportación AVIF y Premium</strong></td>
      <td align="center"><strong>Eliminación de Fondos</strong></td>
      <td align="center"><strong>Gestor de Cola por Lotes</strong></td>
    </tr>
    <tr>
      <td>Codificación multihilo para <strong>AVIF</strong> ultracomprimido y formatos modernos. Reduce el tamaño de archivos sin sacrificar calidad.</td>
      <td>Elimina fondos con <strong>BRIA RMBG-1.4</strong>, un modelo transformador de última generación que se ejecuta localmente a través de HuggingFace.</td>
      <td>Monitorea el procesamiento masivo con una barra de progreso en vivo e informes por archivo en tiempo real. <em>Por Procesar</em> / <em>Procesadas</em> de un vistazo.</td>
    </tr>
    <tr>
      <td align="center" width="33%">🔄</td>
      <td align="center" width="33%">📐</td>
      <td align="center" width="33%">🌐</td>
    </tr>
    <tr>
      <td align="center"><strong>Redimensión y Ajustes</strong></td>
      <td align="center"><strong>SRCSet y Favicons</strong></td>
      <td align="center"><strong>Internacionalización (i18n)</strong></td>
    </tr>
    <tr>
      <td>Ajustar, cubrir, estirar — redimensiona con resoluciones predefinidas o dimensiones personalizadas. Ajusta brillo, contraste, saturación y nitidez.</td>
      <td>Genera automáticamente conjuntos de imágenes responsivas (HTML <code>srcset</code>) y paquetes de favicons multiresolución para la web.</td>
      <td>Soporte completo de inglés y español incluido. Añade más idiomas fácilmente mediante i18next.</td>
    </tr>
  </table>
</p>

---

## 🚀 Inicio Rápido

### Requisitos Previos

- **Python 3.14+** y **Node.js 22+**
- Un **token de HuggingFace** (para los modelos de IA) — [consigue uno gratis](https://huggingface.co/settings/tokens)

### 1. Clonar e Instalar

```bash
git clone https://github.com/quick-sigma/KromaFlow.git
cd kromaflow

# Backend
cd Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Iniciar Servidores de Desarrollo

```bash
# Desde la raíz del proyecto — inicia ambos servidores y abre el navegador
chmod +x run.sh && ./run.sh
```

O individualmente:

```bash
# Backend (puerto 55558)
cd Backend && source .venv/bin/activate && python main.py

# Frontend (puerto 55559)
cd frontend && npm run dev
```

### 3. Abrir la Aplicación

Navega a **http://localhost:55559** — verás el editor de pipelines de KromaFlow.

1. **Carga** una o más imágenes.
2. **Construye** tu pipeline añadiendo, reordenando y configurando pasos.
3. **Procesa** y observa cómo la cola de procesamiento trabaja con tus archivos.
4. **Descarga** los resultados individualmente o como un archivo ZIP.

---

## ⛔ No Desplegar — Solo Herramienta de Desarrollo

> **KromaFlow es una herramienta de desarrollo local, no una aplicación lista para producción.**

Este proyecto fue construido como una **utilidad personal/experimental** para procesamiento de imágenes por lotes en tu máquina local. **No está diseñado, probado ni endurecido** para su despliegue en Internet público o entornos de producción.

**Lo que falta para producción:**
- ❌ Sin autenticación ni gestión de usuarios
- ❌ Sin límite de tasa ni validación de solicitudes a escala
- ❌ Sin base de datos persistente (configuración en memoria, almacenamiento en sistema de archivos)
- ❌ Sin HTTPS, CSP ni cabeceras de seguridad por defecto
- ❌ Sin configuración de contenedorización u orquestación
- ❌ Sin registro de auditoría ni monitoreo

Úsalo en `localhost` para tus propios flujos de trabajo. Si necesitas procesamiento de imágenes de grado producción, explora soluciones SaaS especializadas o refuerza este código con autenticación, infraestructura y seguridad adecuadas antes de considerar el despliegue.

---

## 🧪 Ejecutar Pruebas

```bash
./test.sh
```

O manualmente:

```bash
# Pruebas del backend
cd Backend && source .venv/bin/activate && pytest

# Pruebas del frontend
cd frontend && npm run test
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Zustand, Framer Motion |
| **Backend** | Python 3.14, FastAPI, Uvicorn, Pillow, OpenCV |
| **IA/ML** | Real-ESRGAN, BRIA RMBG-1.4, PyTorch, ONNX Runtime |
| **Formatos de Salida** | PNG, JPEG, AVIF, ICO, WebP |
| **Distribución** | HTML SRCSet, Paquetes de favicons, Archivos ZIP |

---

## 📁 Estructura del Proyecto

```
kromaflow/
├── Backend/                 # Motor de procesamiento FastAPI
│   ├── main.py              # Servidor API + Cola WebSocket
│   ├── step.py              # Abstracción de pasos del pipeline
│   ├── steps_config.py      # Todos los pasos registrados del pipeline
│   ├── resize_step.py       # Operaciones de redimensión
│   ├── adjust_step.py       # Brillo/contraste/saturación
│   ├── bg_removal.py        # Eliminación de fondos (modelo BRIA)
│   ├── real_esrgan_step.py  # Superresolución con IA
│   ├── watermark_remover.py # Eliminación de marcas de agua
│   ├── srcset_distribution.py  # Conjuntos de imágenes responsivas
│   ├── favicon_distribution.py # Generación de favicons
│   └── tests/               # Suite de pruebas pytest
├── frontend/                # UI React + Vite
│   └── src/
│       ├── components/      # Componentes de la interfaz
│       ├── stores/          # Gestión de estado con Zustand
│       └── i18n/            # Internacionalización (en/es)
├── Logo/                    # Recursos de marca
├── journal/                 # Bitácora de desarrollo
├── run.sh                   # Lanzador de desarrollo
└── test.sh                  # Ejecutor de pruebas
```

> **Nota:** Las imágenes procesadas se almacenan en el sistema de archivos del backend (`Backend/storage/`). No se requiere base de datos externa.

---

## 🌐 Internacionalización

KromaFlow incluye **inglés** y **español** listos para usar. Cambia de idioma desde el panel de configuración en la aplicación. Añadir un nuevo idioma es tan simple como crear un nuevo archivo JSON en `frontend/src/i18n/locales/`.

---

## 📄 Licencia

Distribuido bajo la **Licencia MIT**. Consulta el archivo `LICENSE` para más información.

---

<p align="center">
  Construido con ❤️ usando React, FastAPI y PyTorch
  <br />
  <a href="https://github.com/quick-sigma/KromaFlow/issues">Reportar un Error</a> ·
  <a href="https://github.com/quick-sigma/KromaFlow/issues">Solicitar una Característica</a>
</p>
