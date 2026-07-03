<p align="center">
  <a href="INSTALLATION-es.md"><strong>🇪🇸 Versión en español</strong></a>
</p>

# 📦 Installation Guide — KromaFlow

> **KromaFlow** is an advanced image pipeline engine with a Python/FastAPI backend and a React frontend. Below you'll find step-by-step instructions for **Windows**, **Linux**, and **macOS**.

---

## 📋 Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| **Python** | 3.14+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org/) |
| **Git** | Any modern version | [git-scm.com](https://git-scm.com/) |
| **HuggingFace Token** | — | [Get one free](https://huggingface.co/settings/tokens) (required for AI models) |

> **GPU (optional but recommended):** If you have an NVIDIA GPU with CUDA, the AI models (Real-ESRGAN, BRIA background removal) will run **significantly faster**. PyTorch will attempt to detect CUDA automatically.

---

## 🪟 Windows

### 1. Install System Dependencies

#### Python
- Download and install **Python 3.14+** from [python.org](https://www.python.org/downloads/).
- **Important:** During installation, check **"Add Python to PATH"**.
- Verify: open a new **Command Prompt** (`cmd`) and run:
  ```cmd
  python --version
  ```

#### Node.js
- Download and install **Node.js 22+** from [nodejs.org](https://nodejs.org/).
- Verify:
  ```cmd
  node --version
  npm --version
  ```

#### Git
- Download from [git-scm.com](https://git-scm.com/download/win) and install with default options.
- Verify:
  ```cmd
  git --version
  ```

#### Build Tools (for native Python packages)
Some Python packages (e.g., `opencv-python-headless`, `onnxruntime`) may require a C++ compiler:

- **Option A — Microsoft C++ Build Tools**
  Download from [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). During installation, select **"Desktop development with C++"**.
- **Option B — Using pre-built wheels**
  In most cases `pip` will download a pre-built wheel. Only install Build Tools if you encounter compilation errors.

### 2. Clone the Repository

```cmd
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Set Up the Backend

```cmd
cd Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

> **CUDA support on Windows:** If you have an NVIDIA GPU, PyTorch will automatically detect CUDA. To verify it's working:
> ```cmd
> .venv\Scripts\activate
> python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
> ```

### 4. Set Up the Frontend

```cmd
cd frontend
npm install
cd ..
```

### 5. Run the Application

**Option A — Using the launcher (requires Git Bash or WSL):**
> The `run.sh` script uses bash syntax and won't work directly in `cmd`. Use Option B for native Windows.

**Option B — Start servers manually (recommended for Windows):**

Open **two terminal windows**.

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

### 6. Open the App

Navigate to **http://localhost:55559** in your browser.

---

## 🐧 Linux (Ubuntu / Debian / Fedora / Arch)

### 1. Install System Dependencies

#### Python & Node.js

**Ubuntu / Debian:**
```bash
# Python 3.14+ (may need deadsnakes PPA on older Ubuntu)
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm git build-essential
```

If your distro doesn't ship Python 3.14+, use [deadsnakes PPA](https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa):
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

**Verify:**
```bash
python3 --version
node --version
npm --version
```

### 2. Clone the Repository

```bash
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Set Up the Backend

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

> **CUDA on Linux:** If you have an NVIDIA GPU and CUDA installed, PyTorch will detect it automatically. Verify:
> ```bash
> source .venv/bin/activate
> python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
> ```

### 4. Set Up the Frontend

```bash
cd frontend
npm install
cd ..
```

### 5. Run the Application

**Option A — Using the launcher script:**
```bash
chmod +x run.sh
./run.sh
```

**Option B — Manually (two terminals):**

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

### 6. Open the App

Navigate to **http://localhost:55559** in your browser.

---

## 🍎 macOS

### 1. Install System Dependencies

#### Xcode Command Line Tools
```bash
xcode-select --install
```

#### Homebrew (recommended for package management)
If you don't have Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Python & Node.js
```bash
brew install python@3.14 node@22 git
```

Add to your `~/.zshrc` or `~/.bash_profile` if needed:
```bash
export PATH="/opt/homebrew/opt/python@3.14/bin:$PATH"
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

**Verify:**
```bash
python3 --version
node --version
npm --version
```

### 2. Clone the Repository

```bash
git clone https://github.com/quick-sigma/KromaFlow.git
cd KromaFlow
```

### 3. Set Up the Backend

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

> **Apple Silicon (M1/M2/M3/M4) Notes:**
> - PyTorch supports Apple Silicon natively via MPS (Metal Performance Shaders). Verify:
>   ```bash
>   source .venv/bin/activate
>   python -c "import torch; print(f'MPS available: {torch.backends.mps.is_available()}')"
>   ```
> - No CUDA needed — the MPS backend will be used automatically for acceleration.
> - If you encounter issues with `onnxruntime`, install the Apple Silicon version:
>   ```bash
>   pip install onnxruntime-silicon
>   ```

### 4. Set Up the Frontend

```bash
cd frontend
npm install
cd ..
```

### 5. Run the Application

**Option A — Using the launcher script:**
```bash
chmod +x run.sh
./run.sh
```

**Option B — Manually (two terminals):**

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

### 6. Open the App

Navigate to **http://localhost:55559** in your browser.

---

## 🔧 Configuration

### HuggingFace Token (Required for AI Features)

The AI models (Real-ESRGAN super-resolution, BRIA background removal) require a HuggingFace token:

1. Get your token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Launch the app and go to **Settings** (gear icon).
3. Paste your token in the **HuggingFace Token** field.
4. The token is stored in your browser's local storage — you only need to enter it once.

> **No token?** You can still use non-AI features: resize, crop, adjust brightness/contrast, watermark removal, AVIF/WebP export, SRCSet generation, and favicon packages.

---

## 🧪 Running Tests

### All Tests (from project root)
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

### Backend Tests Only
```bash
cd Backend
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows
pytest -v
```

### Frontend Tests Only
```bash
cd frontend
npm test
```

---

## 🐳 Container Guide

KromaFlow ships with production-ready Dockerfiles and Docker Compose files for both **GPU** and **CPU-only** environments. All container images are hardened (no root, no sudo, no shell access for the app user).

> **Prerequisite for all options:** [Docker Engine](https://docs.docker.com/engine/install/), [Podman](https://podman.io/docs/installation), or [Rancher Desktop](https://docs.rancherdesktop.io/getting-started/installation/) installed on your system.

---

### 🎮 Docker — GPU

Runs the backend with CUDA acceleration (Real-ESRGAN, BRIA, Torch). 
Requires an NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

```bash
# 1. Install the NVIDIA Container Toolkit (Linux only)
#    Follow: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
#    Then restart Docker:
sudo systemctl restart docker

# 2. Build and start
docker compose build
docker compose up -d

# 3. Verify GPU is accessible
docker compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 4. Open http://localhost:55559
```

**Files used:**
- `docker-compose.yml` — orchestrates backend (CUDA) + frontend (nginx)
- `Backend/Dockerfile` — multi-stage, based on `nvidia/cuda:12.4.1-runtime-ubuntu22.04`
- `frontend/Dockerfile` — Node 22 build → nginx:stable-alpine serve

---

### 💻 Docker — CPU

CPU-only images based on Ubuntu 22.04 (no NVIDIA driver needed, ~5× smaller).

```bash
# Build and start with the CPU override
docker compose -f docker-compose-cpu.yml build
docker compose -f docker-compose-cpu.yml up -d

# Open http://localhost:55559
```

**Files used:**
- `docker-compose-cpu.yml` — CPU-only orchestration
- `Backend/DockerfileCPU` — based on `ubuntu:22.04`, uses onnxruntime (CPU) and torch CPU
- `frontend/DockerfileCPU` — identical to the GPU version (frontend doesn't use GPU)

---

### 🦭 Podman — GPU

Podman can run the same Docker Compose files. For GPU access, Podman uses **CDI (Container Device Interface)**.

```bash
# 1. Install NVIDIA Container Toolkit and configure it for Podman
#    https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
sudo nvidia-ctk runtime configure --runtime=podman
sudo systemctl restart podman

# 2. Create a CDI specification (one-time)
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml

# 3. Run with Podman Compose (install podman-compose or use podman compose plugin)
podman-compose build
podman-compose up -d

# 4. Verify GPU is accessible
podman-compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 5. Open http://localhost:55559
```

> **Note:** Podman is rootless by default. If you encounter permission issues with GPU devices, you may need to run with `--rootful` or configure CDI properly. See the [NVIDIA Podman guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#configuring-podman) for details.

---

### 🦭 Podman — CPU

Same CPU-only compose file, no GPU configuration needed.

```bash
podman-compose -f docker-compose-cpu.yml build
podman-compose -f docker-compose-cpu.yml up -d

# Open http://localhost:55559
```

> **Troubleshooting:** If `podman-compose` is not available, install it:
> ```bash
> pip install podman-compose
> # Or on Fedora:
> sudo dnf install podman-compose
> ```

---

### 🐄 Rancher Desktop — GPU

Rancher Desktop provides a Docker-compatible CLI (via Moby/containerd). It supports GPU passthrough on **Linux** hosts with NVIDIA GPUs.

```bash
# 1. Install Rancher Desktop
#    https://docs.rancherdesktop.io/getting-started/installation/

# 2. Enable GPU support in Rancher Desktop settings:
#    - Go to Preferences → Kubernetes → GPU
#    - Check "Enable GPU support"
#    - Apply & restart

# 3. Use the bundled docker CLI (Rancher Desktop replaces it)
docker compose build
docker compose up -d

# 4. Verify GPU
docker compose exec backend python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# 5. Open http://localhost:55559
```

> **macOS / Windows:** GPU passthrough to containers is not supported on macOS or Windows via Rancher Desktop. Use the CPU variant instead.

---

### 🐄 Rancher Desktop — CPU

Works on all platforms (Linux, macOS, Windows) without any GPU setup.

```bash
# Use the Rancher Desktop docker CLI
docker compose -f docker-compose-cpu.yml build
docker compose -f docker-compose-cpu.yml up -d

# Open http://localhost:55559
```

> **Note on Windows/macOS:** Rancher Desktop runs a Linux VM under the hood. The CPU compose file works great here since there's no NVIDIA GPU passthrough on these platforms anyway.

---

### 📊 Comparison

| Setup                | GPU Accel. | Image Size   | NVIDIA Driver Required | Platform          |
|----------------------|-----------|-------------|-----------------------|-------------------|
| Docker GPU           | ✅ CUDA    | ~3.2 GB     | ✅ Host + Toolkit      | Linux             |
| Docker CPU           | ❌         | ~650 MB     | ❌                     | Linux             |
| Podman GPU           | ✅ CUDA    | ~3.2 GB     | ✅ Host + Toolkit + CDI| Linux             |
| Podman CPU           | ❌         | ~650 MB     | ❌                     | Linux             |
| Rancher Desktop GPU  | ✅ CUDA    | ~3.2 GB     | ✅ Host + Toolkit      | Linux             |
| Rancher Desktop CPU  | ❌         | ~650 MB     | ❌                     | Linux, macOS, Win |

---

### 🔧 Common Container Commands

```bash
# View logs
docker compose logs -f          # or podman-compose logs -f

# Stop services
docker compose down             # or podman-compose down

# Rebuild after changes
docker compose build --no-cache # or podman-compose build --no-cache

# Run a one-off command
docker compose exec backend python -c "print('hello')"

# Access volumes (processed images, model cache)
docker volume ls
```

---

## ❗ Troubleshooting

### Common Issues

| Issue | Solution |
|---|---|
| `python: command not found` | Use `python3` instead of `python` (Linux/macOS) or reinstall Python with PATH checked (Windows). |
| `pip: command not found` | Use `pip3` on Linux/macOS, or activate your virtual environment first. |
| `.venv/bin/activate: No such file or directory` | Make sure you created the virtual environment: `python3 -m venv .venv` |
| `RuntimeError: CUDA out of memory` | Reduce batch size or use CPU mode. PyTorch will fall back to CPU automatically. |
| `ModuleNotFoundError: No module named 'torch'` | The AI dependencies are optional. If you don't need AI features, the app still works. To install: `pip install torch torchvision` |
| `Error: listen EADDRINUSE :::55558` | Port 55558 is already in use. Kill the existing process or change the port in `run.sh`. |
| `Fatal error: JavaScript heap out of memory` | Increase Node.js memory: `export NODE_OPTIONS="--max-old-space-size=4096"` (Linux/macOS) or `set NODE_OPTIONS=--max-old-space-size=4096` (Windows) |

### Getting Help

- Open an [issue on GitHub](https://github.com/quick-sigma/KromaFlow/issues)
- Check the `journal/` folder for development notes and changelogs

---

## 🎯 Next Steps

Once KromaFlow is running:

1. **Upload** one or more images via the drag-and-drop zone.
2. **Build a pipeline** — drag in steps like Resize, Adjust, Background Removal, or AI Upscale.
3. **Configure each step** by clicking on it in the editor.
4. **Process** your batch and watch the queue work through your files.
5. **Download** results individually or as a ZIP archive.

Happy processing! 🚀
