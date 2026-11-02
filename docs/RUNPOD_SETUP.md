# RunPod setup (one time, ~10 minutes)

## Step 1 — Wait for the image to build (GitHub)
Every push to `main` builds the Docker image automatically.

1. Open the repo on GitHub → **Actions** tab → **Build images**.
2. Wait for the green check (first build ≈ 10–15 min; later builds are faster).

## Step 2 — Check the image is public (GitHub, once)
RunPod can only download the image without a password if it is **public**. For this repo it already is (it
inherits the public repo's visibility). If you ever make the repo private, or the package page shows **Private**:

1. On GitHub, click your profile picture → **Your profile** → **Packages** tab → **comfyui-image-studio**.
2. **Package settings** (bottom right) → **Danger Zone** → **Change visibility** → **Public**.

The image only contains ComfyUI, scripts and workflows (no models, no personal data), so public is safe.
*(Prefer private? In RunPod, go to **Settings → Container Registry Auth**, add `ghcr.io` with your GitHub username and a
GitHub token with the `read:packages` scope, then select it in the template.)*

## Step 3 — Create the RunPod template
RunPod → **Templates** (left menu, under *Manage*) → **New Template**:

| Field | Value |
|---|---|
| Name | `ComfyUI Image Studio` |
| Type | **Pod** |
| Compute | **Nvidia GPU** |
| Container Image | `ghcr.io/orrazibb/comfyui-image-studio:latest` |
| Container Start Command | *(leave empty)* |
| Container Disk | `20` GB |
| Volume Disk | `80` GB *(holds the ~58 GB of models + your outputs)*. **If your screen has no Volume Disk field**, set Container Disk to `90` GB instead; the only difference is that the models re-download whenever the pod restarts |
| Volume Mount Path | `/workspace` |
| Expose HTTP Ports | `8188,8888` |
| Environment Variables | optional: `JUPYTER_PASSWORD` = a password of your choice (enables the file browser on 8888) |

Save.

## Step 4 — Launch a test pod
1. **Pods → Deploy** (or *Templates → your template → Deploy*).
2. Choose **RTX 5090** (or **RTX 4090**).
3. Under the GPU filters, set **CUDA Versions** to **13.0** and newer. The image needs a recent NVIDIA driver;
   without this filter you may land on an older host where PyTorch can't see the GPU.
4. Make sure your **ComfyUI Image Studio** template is selected → **Deploy On-Demand**.
5. Open the pod → **Logs**. First boot downloads ~58 GB of models (usually 5–15 minutes). You'll see lines like
   `downloaded 16.4GB in 95s  diffusion_models/joyai_image_edit_plus_int8_convrot.safetensors`
   and finally `==> All models ready` and `Starting ComfyUI`.
6. **Connect → HTTP Service [Port 8188]** opens ComfyUI.
7. Left sidebar → **Workflows** → pick one → **Run**.

Then work through [TESTING.md](TESTING.md).

## Step 5 — Later: keep the models on a Network Volume
So you don't re-download 58 GB every time you create a pod:

1. RunPod → **Storage → New Network Volume**. Pick a datacenter that has 5090s/4090s, size **100 GB**.
2. Deploy pods **from that volume** (Storage → your volume → Deploy, or pick the volume on the deploy page)
   with the same template. The volume is mounted at `/workspace`.
3. The first pod downloads the models onto the volume; every pod after that starts in about a minute.

Your outputs (`/workspace/output`), uploaded inputs and any workflows you save also live on the volume.

## Notes
- **Stopping vs terminating:** a *stopped* pod keeps its volume disk (small storage fee). *Terminating* deletes it
  unless you use a network volume.
- **Workflow updates:** the 5 built-in workflows are refreshed from the image on every boot. If you customise one,
  use **Save As** with a new name so your version is kept.
- **Getting outputs:** right-click an image in ComfyUI → *Save Image*, or open the **Assets** / queue panel.
  For many files, set `JUPYTER_PASSWORD`, open port 8888, browse to `output/`, right-click → *Download*
  (or select a folder and download as an archive).
- **Updating the image:** pods use `:latest` at deploy time. After a new build, newly deployed pods get it.
