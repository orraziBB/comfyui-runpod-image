# Generic ComfyUI image for RunPod pods. Each "stack" (stacks/<name>) adds its own
# model list and workflows. Models are NOT baked in: they download on first boot
# into /workspace (attach a network volume to keep them between pods).
ARG BASE_IMAGE=python:3.13-slim-trixie
FROM ${BASE_IMAGE}

ARG STACK=image-studio
ARG COMFYUI_VERSION=v0.43.2
ARG TORCH_VERSION=2.14.1
ARG TORCH_INDEX=https://download.pytorch.org/whl/cu130
ARG BUILD_INFO=dev

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates tini ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv && pip install --upgrade pip wheel

# PyTorch (CUDA 13.0 build: supports RTX 4090 and RTX 5090).
RUN pip install "torch==${TORCH_VERSION}" torchvision --index-url "${TORCH_INDEX}"

# ComfyUI, pinned to a release.
RUN git clone --depth 1 --branch "${COMFYUI_VERSION}" https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI \
    && pip install -r /opt/ComfyUI/requirements.txt \
    && pip install "huggingface_hub[hf_xet]" jupyterlab

COPY common/ /opt/runpod/
COPY stacks/${STACK}/ /opt/stack/
RUN chmod +x /opt/runpod/*.sh \
    && echo "${STACK}" > /opt/stack/STACK_NAME \
    && echo "${BUILD_INFO} (ComfyUI ${COMFYUI_VERSION}, torch ${TORCH_VERSION})" > /opt/stack/BUILD_INFO

WORKDIR /opt/ComfyUI
EXPOSE 8188 8888
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/runpod/start.sh"]
