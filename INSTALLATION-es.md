<p align="center">
  <a href="INSTALLATION.md"><strong>🇬🇧 English version</strong></a>
</p>

# 📦 Guía de Instalación — KromaFlow

> **KromaFlow** es un motor avanzado de pipelines de imagen con un backend en Python/FastAPI y un frontend en React. A continuación encontrarás instrucciones paso a paso para **Windows**, **Linux** y **macOS**.

---

## 📑 Índice de Contenidos

- [📋 Requisitos Previos](#-requisitos-previos)
- [🪟 Windows](#-windows)
- [🐧 Linux (Ubuntu / Debian / Fedora / Arch)](#-linux-ubuntu--debian--fedora--arch)
- [🍎 macOS](#-macos)
- [🔧 Configuración](#-configuración)
- [🧪 Ejecutar Pruebas](#-ejecutar-pruebas)
- [🐳 Guía de Contenedores](#-guía-de-contenedores)
  - [🎮 Docker — GPU](#-docker--gpu)
  - [💻 Docker — CPU](#-docker--cpu)
  - [🦭 Podman — GPU](#-podman--gpu)
  - [🦭 Podman — CPU](#-podman--cpu)
  - [🐄 Rancher Desktop — GPU](#-rancher-desktop--gpu)
  - [🐄 Rancher Desktop — CPU](#-rancher-desktop--cpu)
  - [📊 Comparativa](#-comparativa)
  - [🔧 Comandos Comunes de Contenedores](#-comandos-comunes-de-contenedores)
- [❓ Solución de Problemas](#-solución-de-problemas)
- [🎯 Próximos Pasos](#-próximos-pasos)

---

## 📋 Requisitos Previos

| Requisito | Versión Mínima | Notas |
|---|---|---|
| **Python** | 3.14+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org/) |
| **Git** | Cualquier versión moderna | [git-scm.com](https://git-scm.com/) |
| **Token de HuggingFace** | — | [Consigue uno gratis](https://huggingface.co/settings/tokens) (requerido para modelos de IA) |

> **GPU (opcional pero recomendada):** Si tienes una GPU NVIDIA con CUDA, los modelos de IA (Real-ESRGAN, eliminación de fondos BRIA) funcionarán **significativamente más rápido**. PyTorch detectará CUDA automáticamente.

---

## 🪟 Windows

### 1. Instalar Dependencias del Sistema

#### Python
- Descarga e instala **Python 3.14+** desde [python.org](https://www.python.org/downloads/).
- **Importante:** Durante la instalación, marca **"Add Python to PATH"**.
- Verifica: abre una nueva ventana de **Símbolo del sistema** (`cmd`) y ejecuta:
  ```cmd
  python --version
  ```

#### Node.js
- Descarga e instala **Node.js 22+** desde [nodejs.org](https://nodejs.org/).
- Verifica:
  ```cmd
  node --version
  npm --version
  ```

#### Git
- Descárgalo desde [git-scm.com](https://git-scm.com/download/win) e instálalo con las opciones predeterminadas.
- Verifica:
  ```cmd
  git --version
  ```

#### Herramientas de Compilación (para paquetes nativos de Python)
Algunos paquetes de Python (ej. `opencv-python-headless`, `onnxruntime`) pueden requerir un compilador de C++:

- **Opción A — Microsoft C++ Build Tools**
  Descarga desde [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Durante la instalación, selecciona **"Desarrollo de escritorio con C++"**.
- **Opción B — Usar ruedas precompiladas**
  En la mayoría de los casos `pip` descargará una rueda precompilada. Solo instala Build Tools si encuentras errores de compilación.

### 2. Clonar el Repositorio

```cmd
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Configurar el Backend

```cmd
cd Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

> **Soporte CUDA en Windows:** Si tienes una GPU NVIDIA, PyTorch detectará CUDA automáticamente. Para verificarlo:
> ```cmd
> .venv\Scripts\activate
> python -c "import torch; print(f'CUDA disponible: {torch.cuda.is_available()}')"
> ```

### 4. Configurar el Frontend

```cmd
cd frontend
npm install
cd ..
```

### 5. Ejecutar la Aplicación

**Opción A — Usar el lanzador (requiere Git Bash o WSL):**
> El script `run.sh` usa sintaxis bash y no funcionará directamente en `cmd`. Usa la Opción B para Windows nativo.

**Opción B — Iniciar servidores manualmente (recomendado para Windows):**

Abre **dos ventanas de terminal**.

**Terminal 1 — Backend:**
```cmd
cd Backend
.venv\Scripts\activate
python main.py
```

**Terminal 2 — Frontend:**
```cmd
cd frontend
npm run dev
```

### 6. Abrir la Aplicación

Navega a **http://localhost:55559** en tu navegador.

---

## 🐧 Linux (Ubuntu / Debian / Fedora / Arch)

### 1. Instalar Dependencias del Sistema

#### Python y Node.js

**Ubuntu / Debian:**
```bash
# Python 3.14+ (puede necesitar el PPA deadsnakes en Ubuntu antiguo)
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm git build-essential
```

Si tu distribución no incluye Python 3.14+, usa [deadsnakes PPA](https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa):
```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.14 python3.14-venv python3.14-pip
```

**Fedora:**
```bash
sudo dnf install -y python3 python3-pip python3-virtualenv nodejs npm git gcc-c++
```

**Arch Linux:**
```bash
sudo pacman -S python python-pip nodejs npm git base-devel
```

**Verifica:**
```bash
python3 --version
node --version
npm --version
```

### 2. Clonar el Repositorio

```bash
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Configurar el Backend

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

> **CUDA en Linux:** Si tienes una GPU NVIDIA y CUDA instalado, PyTorch lo detectará automáticamente. Verifica:
> ```bash
> source .venv/bin/activate
> python -c "import torch; print(f'CUDA disponible: {torch.cuda.is_available()}')"
> ```

### 4. Configurar el Frontend

```bash
cd frontend
npm install
cd ..
```

### 5. Ejecutar la Aplicación

**Opción A — Usando el script lanzador:**
```bash
chmod +x run.sh
./run.sh
```

**Opción B — Manualmente (dos terminales):**

**Terminal 1 — Backend:**
```bash
cd Backend
source .venv/bin/activate
python main.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

### 6. Abrir la Aplicación

Navega a **http://localhost:55559** en tu navegador.

---

## 🍎 macOS

### 1. Instalar Dependencias del Sistema

#### Xcode Command Line Tools
```bash
xcode-select --install
```

#### Homebrew (recomendado para gestión de paquetes)
Si no tienes Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Python y Node.js
```bash
brew install python@3.14 node@22 git
```

Añade a tu `~/.zshrc` o `~/.bash_profile` si es necesario:
```bash
export PATH="/opt/homebrew/opt/python@3.14/bin:$PATH"
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

**Verifica:**
```bash
python3 --version
node --version
npm --version
```

### 2. Clonar el Repositorio

```bash
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Configurar el Backend

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

> **Notas para Apple Silicon (M1/M2/M3/M4):**
> - PyTorch soporta Apple Silicon de forma nativa mediante MPS (Metal Performance Shaders). Verifica:
>   ```bash
>   source .venv/bin/activate
>   python -c "import torch; print(f'MPS disponible: {torch.backends.mps.is_available()}')"
>   ```
> - No se necesita CUDA — el backend MPS se usará automáticamente para aceleración.
> - Si tienes problemas con `onnxruntime`, instala la versión para Apple Silicon:
>   ```bash
>   pip install onnxruntime-silicon
>   ```

### 4. Configurar el Frontend

```bash
cd frontend
npm install
cd ..
```

### 5. Ejecutar la Aplicación

**Opción A — Usando el script lanzador:**
```bash
chmod +x run.sh
./run.sh
```

**Opción B — Manualmente (dos terminales):**

**Terminal 1 — Backend:**
```bash
cd Backend
source .venv/bin/activate
python main.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

### 6. Abrir la Aplicación

Navega a **http://localhost:55559** en tu navegador.

---

## 🔧 Configuración

### Token de HuggingFace (Requerido para Funciones de IA)

Los modelos de IA (superresolución Real-ESRGAN, eliminación de fondos BRIA) requieren un token de HuggingFace:

1. Obtén tu token en [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Inicia la aplicación y ve a **Ajustes** (icono de engranaje).
3. Pega tu token en el campo **Token de HuggingFace**.
4. El token se almacena en el almacenamiento local de tu navegador — solo necesitas ingresarlo una vez.

> **¿Sin token?** Puedes usar funciones que no requieren IA: redimensionar, recortar, ajustar brillo/contraste, eliminar marcas de agua, exportar AVIF/WebP, generar SRCSet y paquetes de favicons.

---

## 🧪 Ejecutar Pruebas

### Todas las Pruebas (desde la raíz del proyecto)
```bash
# Linux / macOS
chmod +x test.sh && ./test.sh

# Windows (cmd)
cd Backend
.venv\Scripts\activate
python -m pytest tests\ -v
cd ..\frontend
npm test
```

### Solo Pruebas del Backend
```bash
cd Backend
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows
pytest -v
```

### Solo Pruebas del Frontend
```bash
cd frontend
npm test
```

---

## 🐳 Guía de Contenedores

KromaFlow incluye Dockerfiles y archivos Docker Compose listos para producción, tanto para entornos **GPU** como **solo CPU**. Todas las imágenes de contenedor están endurecidas (sin root, sin sudo, sin acceso shell para el usuario de la app).

> **Requisito para todas las opciones:** [Docker Engine](https://docs.docker.com/engine/install/), [Podman](https://podman.io/docs/installation), o [Rancher Desktop](https://docs.rancherdesktop.io/getting-started/installation/) instalado en tu sistema.

---

### 🎮 Docker — GPU

Ejecuta el backend con aceleración CUDA (Real-ESRGAN, BRIA, Torch).
Requiere una GPU NVIDIA con el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

```bash
# 1. Instala el NVIDIA Container Toolkit (solo Linux)
#    Sigue: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
#    Luego reinicia Docker:
sudo systemctl restart docker

# 2. Construye e inicia
docker compose build
docker compose up -d

# 3. Verifica que la GPU sea accesible
docker compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 4. Abre http://localhost:55559
```

**Archivos utilizados:**
- `docker-compose.yml` — orquestación backend (CUDA) + frontend (nginx)
- `Backend/Dockerfile` — multi-etapa, basado en `nvidia/cuda:12.4.1-runtime-ubuntu22.04`
- `frontend/Dockerfile` — compilación Node 22 → nginx:stable-alpine

---

### 💻 Docker — CPU

Imágenes solo CPU basadas en Ubuntu 22.04 (sin necesidad de driver NVIDIA, ~5× más pequeñas).

```bash
# Construye e inicia con la configuración CPU
docker compose -f docker-compose-cpu.yml build
docker compose -f docker-compose-cpu.yml up -d

# Abre http://localhost:55559
```

**Archivos utilizados:**
- `docker-compose-cpu.yml` — orquestación solo CPU
- `Backend/DockerfileCPU` — basado en `ubuntu:22.04`, usa onnxruntime (CPU) y torch CPU
- `frontend/DockerfileCPU` — idéntico a la versión GPU (el frontend no usa GPU)

---

### 🦭 Podman — GPU

Podman puede usar los mismos archivos Docker Compose. Para acceso a GPU, Podman utiliza **CDI (Container Device Interface)**.

```bash
# 1. Instala NVIDIA Container Toolkit y configúralo para Podman
#    https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
sudo nvidia-ctk runtime configure --runtime=podman
sudo systemctl restart podman

# 2. Genera la especificación CDI (una sola vez)
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml

# 3. Ejecuta con Podman Compose
podman-compose build
podman-compose up -d

# 4. Verifica la GPU
podman-compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 5. Abre http://localhost:55559
```

> **Nota:** Podman opera sin root por defecto. Si tienes problemas de permisos con dispositivos GPU, es posible que necesites ejecutar con `--rootful` o configurar CDI adecuadamente. Consulta la [guía de NVIDIA para Podman](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#configuring-podman) para más detalles.

---

### 🦭 Podman — CPU

Mismo archivo compose solo CPU, sin necesidad de configuración GPU.

```bash
podman-compose -f docker-compose-cpu.yml build
podman-compose -f docker-compose-cpu.yml up -d

# Abre http://localhost:55559
```

> **Solución de problemas:** Si `podman-compose` no está disponible, instálalo:
> ```bash
> pip install podman-compose
> # O en Fedora:
> sudo dnf install podman-compose
> ```

---

### 🐄 Rancher Desktop — GPU

Rancher Desktop proporciona una CLI compatible con Docker (mediante Moby/containerd). Soporta paso de GPU en hosts **Linux** con GPUs NVIDIA.

```bash
# 1. Instala Rancher Desktop
#    https://docs.rancherdesktop.io/getting-started/installation/

# 2. Habilita el soporte GPU en la configuración:
#    - Preferencias → Kubernetes → GPU
#    - Marca "Enable GPU support"
#    - Aplica y reinicia

# 3. Usa el CLI docker incluido (Rancher Desktop lo reemplaza)
docker compose build
docker compose up -d

# 4. Verifica la GPU
docker compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 5. Abre http://localhost:55559
```

> **macOS / Windows:** Rancher Desktop no soporta paso de GPU en macOS o Windows. Usa la variante CPU en esas plataformas.

---

### 🐄 Rancher Desktop — CPU

Funciona en todas las plataformas (Linux, macOS, Windows) sin configuración GPU.

```bash
# Usa el CLI docker de Rancher Desktop
docker compose -f docker-compose-cpu.yml build
docker compose -f docker-compose-cpu.yml up -d

# Abre http://localhost:55559
```

> **Nota para Windows/macOS:** Rancher Desktop ejecuta una VM Linux internamente. El archivo compose CPU funciona muy bien aquí ya que no hay paso de GPU NVIDIA en estas plataformas.

---

### 📊 Comparativa

| Configuración         | Acel. GPU   | Tamaño Imagen | Driver NVIDIA Requerido | Plataforma       |
|-----------------------|------------|--------------|------------------------|------------------|
| Docker GPU            | ✅ CUDA    | ~3.2 GB      | ✅ Host + Toolkit       | Linux            |
| Docker CPU            | ❌         | ~650 MB      | ❌                      | Linux            |
| Podman GPU            | ✅ CUDA    | ~3.2 GB      | ✅ Host + Toolkit + CDI | Linux            |
| Podman CPU            | ❌         | ~650 MB      | ❌                      | Linux            |
| Rancher Desktop GPU   | ✅ CUDA    | ~3.2 GB      | ✅ Host + Toolkit       | Linux            |
| Rancher Desktop CPU   | ❌         | ~650 MB      | ❌                      | Linux, macOS, Win |

---

### 🔧 Comandos Comunes de Contenedores

```bash
# Ver logs
docker compose logs -f          # o podman-compose logs -f

# Detener servicios
docker compose down             # o podman-compose down

# Reconstruir después de cambios
docker compose build --no-cache # o podman-compose build --no-cache

# Ejecutar un comando puntual
docker compose exec backend python -c "print('hola')"

# Acceder a volúmenes (imágenes procesadas, caché de modelos)
docker volume ls
```

---

## ❗ Solución de Problemas

### Problemas Comunes

| Problema | Solución |
|---|---|
| `python: command not found` | Usa `python3` en Linux/macOS, o reinstala Python con PATH marcado en Windows. |
| `pip: command not found` | Usa `pip3` en Linux/macOS, o activa primero tu entorno virtual. |
| `.venv/bin/activate: No such file or directory` | Asegúrate de haber creado el entorno virtual: `python3 -m venv .venv` |
| `RuntimeError: CUDA out of memory` | Reduce el tamaño del lote o usa modo CPU. PyTorch usará CPU automáticamente. |
| `ModuleNotFoundError: No module named 'torch'` | Las dependencias de IA son opcionales. Si no necesitas IA, la app funciona igual. Para instalar: `pip install torch torchvision` |
| `Error: listen EADDRINUSE :::55558` | El puerto 55558 ya está en uso. Mata el proceso existente o cambia el puerto en `run.sh`. |
| `Fatal error: JavaScript heap out of memory` | Aumenta la memoria de Node.js: `export NODE_OPTIONS="--max-old-space-size=4096"` (Linux/macOS) o `set NODE_OPTIONS=--max-old-space-size=4096` (Windows) |

### Obtener Ayuda

- Abre un [issue en GitHub](https://github.com/quick-sigma/KromaFlow/issues)
- Revisa la carpeta `journal/` para notas de desarrollo y registros de cambios

---

## 🎯 Próximos Pasos

Una vez que KromaFlow esté funcionando:

1. **Carga** una o más imágenes mediante la zona de arrastrar y soltar.
2. **Construye un pipeline** — arrastra pasos como Redimensionar, Ajustar, Eliminación de Fondos o Ampliación con IA.
3. **Configura cada paso** haciendo clic en él dentro del editor.
4. **Procesa** tu lote y observa cómo la cola trabaja con tus archivos.
5. **Descarga** los resultados individualmente o como un archivo ZIP.

¡Feliz procesamiento! 🚀
