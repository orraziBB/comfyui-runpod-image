# ComfyUI RunPod Images

Ready-to-run ComfyUI setups for RunPod. Pick the template, deploy a pod, open ComfyUI, load a workflow, go.
Nothing to install, no models to hunt down.

| Stack | What it does | Image |
|---|---|---|
| **image-studio** | Text-to-image (photo + cartoon), edit with text, edit/combine with up to 6 images, character swap, optional prompt enhancer | `ghcr.io/orrazibb/comfyui-image-studio:latest` |

➡️ **First time? Follow [docs/RUNPOD_SETUP.md](docs/RUNPOD_SETUP.md)**, then the test checklist in [docs/TESTING.md](docs/TESTING.md).

---

## image-studio

### Workflows (in ComfyUI's **Workflows** sidebar)

| # | Workflow | Model | Use it for |
|---|---|---|---|
| 1 | Generate (MOSS-Image) | MOSS-Image SFT | Text → image. Photoreal **and** illustration/anime/cartoon; good at text in images |
| 2 | Generate (Z-Image-Turbo) | Z-Image-Turbo | Text → image. Very fast (8 steps), strongest photorealism |
| 3 | Edit with text (JoyAI) | JoyAI-Image-Edit-Plus | "Stand the character up, arms out to the sides" |
| 4 | Edit with multiple images (JoyAI) | JoyAI-Image-Edit-Plus | Combine **Image_1…Image_6**: outfits, props, chairs, backgrounds, **character swap** |
| 5 | Edit with text (MOSS, alternative) | MOSS-Image + official edit LoRA | Second opinion / fallback for single-image edits |

Every workflow has:
- a **📖 Read me** note with instructions and examples,
- a **✨ Enhance prompt** switch: a local AI (Qwen3.5-9B, runs on the pod, no API key) rewrites your prompt into what the model understands best. In the edit workflows it **looks at your images** first,
- a **📝 Final prompt** box showing exactly what was sent to the model,
- an **⚙️ Engine** group you never need to touch.

Results are saved under `/workspace/output/` (`generate/…` and `edit/…`).

### Multi-image editing in short (workflow 4)
- Load images into **Image_1, Image_2, …** in order. **Image_1 is the canvas** (the result keeps its framing).
- Slots 3–6 start switched off: click one and press **Ctrl+B** to turn it on. Use slots in order, no gaps.
- Refer to them in your text as `Image_1`, `Image_2`… These are converted automatically to the "first image / second image" wording the model was trained on.
- **Character swap:** scene in Image_1, your character in Image_2:
  *"Replace the person in Image_1 with the character from Image_2. Keep the pose, lighting and background of Image_1."*

### Models and licences (all allow commercial use)

| Model | Licence | Files | Download |
|---|---|---|---|
| [MOSS-Image SFT](https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT) ([ComfyUI files](https://huggingface.co/Comfy-Org/MOSS-Image)) + edit LoRA | Apache 2.0 | int8 model, Qwen3.5-9B w4a8 text encoder, small FLUX.2 VAE | ~13.3 GB |
| [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) ([ComfyUI files](https://huggingface.co/Comfy-Org/Z-Image-Turbo)) | Apache 2.0 | bf16 model, Qwen3-4B fp8 text encoder, VAE | ~18.3 GB |
| [JoyAI-Image-Edit-Plus](https://huggingface.co/jdopensource/JoyAI-Image-Edit-Plus-ComfyUI) | Apache 2.0 | int8 model, Qwen3-VL-8B int8 text encoder, Wan 2.1 VAE | ~26.7 GB |

Total ≈ **58 GB**. Exact files and pinned versions: [`stacks/image-studio/models.json`](stacks/image-studio/models.json).
The prompt enhancer reuses MOSS's text encoder (no extra download).

> Licence note: Apache 2.0 lets you use outputs commercially. Always keep an eye on the model cards in case a project changes its terms for *future* versions; the versions pinned here are Apache 2.0.

### GPU
- **RTX 5090 (32 GB):** recommended.
- **RTX 4090 (24 GB):** works. Models load one at a time; JoyAI edits are slower than on a 5090.
- When deploying, set **CUDA version 13.0 or newer** in RunPod's filters (this image uses PyTorch for CUDA 13.0).

### Options (environment variables in the RunPod template)

| Variable | Default | What it does |
|---|---|---|
| `MODEL_GROUPS` | *(all)* | Only download some models, e.g. `moss,joyai` (groups: `moss`, `zimage`, `joyai`). Workflow 2 needs `moss` too if you use the enhancer. |
| `JUPYTER_PASSWORD` | *(unset)* | Set it to start JupyterLab on port 8888 (file browser, bulk download of outputs). |
| `HF_TOKEN` | *(unset)* | Only needed for gated Hugging Face models (none by default). |
| `SKIP_MODEL_DOWNLOAD` | `false` | Skip the model check at boot. |
| `COMFYUI_ARGS` | *(empty)* | Extra ComfyUI flags, e.g. `--lowvram`. |

---

## How this repo works

```
Dockerfile                    generic ComfyUI image (ComfyUI v0.43.2, PyTorch 2.14.1 / CUDA 13.0)
common/start.sh               boot: link /workspace, install workflows, download models, start ComfyUI
common/download_models.py     resumable, skips files already on the volume
stacks/<name>/models.json     which models a stack needs (pinned revisions)
stacks/<name>/workflows.mjs   workflow definitions (source of truth)
stacks/<name>/workflows/      generated ComfyUI workflow files (what you load)
stacks/<name>/examples/       placeholder input images
tools/build_workflows.mjs     builds + validates workflow files in a real ComfyUI page
tools/dev_server.sh           CPU-only ComfyUI with placeholder models for building
.github/workflows/build.yml   builds ghcr.io/<owner>/comfyui-<stack>:latest on every push to main
```

Models are **downloaded at boot, not baked into the image**. That keeps the image small (fast pod start)
and lets a network volume hold the models once for every future pod.

### Adding a new stack later
1. Copy `stacks/image-studio` to `stacks/<new-name>`, edit `models.json` and `workflows.mjs`.
2. Add `<new-name>` to the `matrix.stack` list in `.github/workflows/build.yml`.
3. Rebuild the workflow files (below) and push. A new image `comfyui-<new-name>` is published.

### Rebuilding the workflow files
```bash
python -m venv .venv && . .venv/bin/activate
git clone --depth 1 --branch v0.43.2 https://github.com/comfyanonymous/ComfyUI ../ComfyUI
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r ../ComfyUI/requirements.txt
tools/dev_server.sh ../ComfyUI image-studio &      # wait until it says "Starting server"
npm i playwright && npx playwright install chromium
node tools/build_workflows.mjs image-studio
```
