#!/usr/bin/env bash
# Start a CPU-only ComfyUI for building/validating workflows (no GPU, no real models).
# Model files are created as empty placeholders so model dropdowns validate.
#
# Usage: tools/dev_server.sh <path-to-ComfyUI-checkout> <stack> [port]
set -euo pipefail
COMFY="$1"; STACK="$2"; PORT="${3:-8188}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
mkdir -p "$WORK"/{models,input,output,user}

python3 - "$ROOT/stacks/$STACK/models.json" "$WORK/models" <<'EOF'
import json, os, sys
for m in json.load(open(sys.argv[1]))["models"]:
    d = os.path.join(sys.argv[2], m["dest"]); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, os.path.basename(m["file"])), "wb").close()
EOF
cp "$ROOT/stacks/$STACK"/examples/* "$WORK/input/" 2>/dev/null || true

cat > "$WORK/extra_models.yaml" <<EOF
dev:
  base_path: $WORK/models
  diffusion_models: diffusion_models
  text_encoders: text_encoders
  vae: vae
  loras: loras
EOF

echo "workspace: $WORK"
cd "$COMFY"
exec python main.py --cpu --listen 127.0.0.1 --port "$PORT" \
  --input-directory "$WORK/input" --output-directory "$WORK/output" \
  --user-directory "$WORK/user" --extra-model-paths-config "$WORK/extra_models.yaml" \
  --disable-auto-launch
