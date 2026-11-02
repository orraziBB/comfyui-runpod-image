#!/usr/bin/env bash
# Container entrypoint: prepare /workspace, download models, start ComfyUI.
set -uo pipefail

COMFY=/opt/ComfyUI
STACK=/opt/stack
WORKSPACE="${WORKSPACE:-/workspace}"
PORT="${COMFYUI_PORT:-8188}"

echo "============================================================"
echo " ComfyUI RunPod image: $(cat /opt/stack/STACK_NAME 2>/dev/null || echo unknown)"
echo " Build: $(cat /opt/stack/BUILD_INFO 2>/dev/null || echo dev)"
echo " Workspace: $WORKSPACE"
echo "============================================================"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null \
  || echo "WARNING: nvidia-smi not available - is this a GPU pod?"
echo "Disk space:"; df -h "$WORKSPACE" / 2>/dev/null | sed 's/^/    /'
if ! mountpoint -q "$WORKSPACE" 2>/dev/null; then
  echo "NOTE: $WORKSPACE is on the container disk (no volume attached). That's fine if Container Disk"
  echo "      is ~90 GB, but models re-download every time the pod restarts. A Network Volume avoids that."
fi

# ---------------------------------------------------------------- folders
# Everything you create lives in /workspace, so it survives on a network volume.
mkdir -p "$WORKSPACE"/{models,output,input,user/default/workflows}
for sub in checkpoints diffusion_models text_encoders vae loras upscale_models controlnet clip_vision embeddings; do
  mkdir -p "$WORKSPACE/models/$sub"
done

# Point ComfyUI's folders at the workspace.
for d in models output input; do
  if [ ! -L "$COMFY/$d" ]; then rm -rf "${COMFY:?}/$d"; ln -s "$WORKSPACE/$d" "$COMFY/$d"; fi
done

# ---------------------------------------------------------------- workflows
# Our workflows are refreshed on every boot so image updates take effect.
# To keep your own changes, use "Save As" with a different name.
WF_DEST="$WORKSPACE/user/default/workflows"
cp -f "$STACK"/workflows/*.json "$WF_DEST"/
echo "==> Installed workflows:"; ls -1 "$STACK"/workflows/ | sed 's/^/    /'

# Example input images so every workflow runs out of the box.
cp -n "$STACK"/examples/* "$WORKSPACE/input/" 2>/dev/null || true

# ---------------------------------------------------------------- jupyter (optional)
if [ "${ENABLE_JUPYTER:-true}" = "true" ]; then
  if [ -n "${JUPYTER_PASSWORD:-}" ]; then
    echo "==> Starting JupyterLab on port 8888 (file browser / bulk downloads)"
    nohup jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
      --ServerApp.root_dir="$WORKSPACE" \
      --IdentityProvider.token="$JUPYTER_PASSWORD" \
      --ServerApp.allow_origin='*' > /tmp/jupyter.log 2>&1 &
  else
    echo "==> JupyterLab not started (set JUPYTER_PASSWORD in the template to enable it)"
  fi
fi

# ---------------------------------------------------------------- models
if [ "${SKIP_MODEL_DOWNLOAD:-false}" != "true" ]; then
  python /opt/runpod/download_models.py "$STACK/models.json" "$WORKSPACE/models" \
    || echo "WARNING: some models failed to download - see above. Restart the pod to retry."
fi

# ---------------------------------------------------------------- comfyui
echo "==> Starting ComfyUI on port $PORT"
cd "$COMFY"
# shellcheck disable=SC2086
exec python main.py \
  --listen 0.0.0.0 \
  --port "$PORT" \
  --user-directory "$WORKSPACE/user" \
  --disable-auto-launch \
  ${COMFYUI_ARGS:-}
