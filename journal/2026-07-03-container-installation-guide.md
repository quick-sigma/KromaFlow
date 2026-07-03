# 2026-07-03 — Container Installation Guide Expansion

## Summary
Replaced the outdated "Docker (Alternative)" section in both `INSTALLATION.md` and `INSTALLATION-es.md` with a comprehensive container guide covering Docker, Podman, and Rancher Desktop — each with GPU and CPU variants.

## Changes

### `INSTALLATION.md` (English)
- **Removed:** The old placeholder Docker section that said "KromaFlow does not ship a Dockerfile yet" with a minimal Dockerfile example.
- **Added:** Complete "Container Guide" section with:
  - **Docker — GPU:** Full CUDA setup with NVIDIA Container Toolkit, build & start commands, GPU verification
  - **Docker — CPU:** CPU-only variant using `docker-compose-cpu.yml`
  - **Podman — GPU:** CDI-based GPU configuration with `nvidia-ctk`, `podman-compose` usage
  - **Podman — CPU:** CPU-only variant with troubleshooting for `podman-compose` installation
  - **Rancher Desktop — GPU:** GPU passthrough via Rancher settings (Linux only)
  - **Rancher Desktop — CPU:** Cross-platform CPU variant (Linux, macOS, Windows)
  - **Comparison table:** All 6 setups side by side (GPU acceleration, image size, driver requirements, platform support)
  - **Common container commands:** logs, stop, rebuild, exec, volumes

### `INSTALLATION-es.md` (Spanish)
- Same changes as English version, fully translated.

## Links Verified
All external links were confirmed online:
- [Docker Engine Installation](https://docs.docker.com/engine/install/) ✅
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) ✅
- [Podman Installation](https://podman.io/docs/installation) ✅
- [Rancher Desktop Installation](https://docs.rancherdesktop.io/getting-started/installation/) ✅

## Files Changed
- `INSTALLATION.md` — lines 360-378 replaced with new 178-line container guide
- `INSTALLATION-es.md` — lines 360-378 replaced with new 178-line container guide (Spanish)
