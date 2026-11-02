#!/usr/bin/env python3
"""Download the models listed in a stack's models.json into ComfyUI's models folder.

- Files that already exist with the right size are skipped, so a network volume
  only downloads once.
- Downloads are resumable: if a pod is stopped half-way, the next boot continues.
- MODEL_GROUPS (comma separated, e.g. "moss,joyai") limits which groups are fetched.
  Default: all groups.
- HF_TOKEN is passed through automatically by huggingface_hub if set (not needed
  for the default models, which are all public).
"""
import json
import os
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

os.environ.setdefault("HF_XET_HIGH_PERFORMANCE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

from huggingface_hub import HfApi, hf_hub_download  # noqa: E402


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}PB"


def expected_size(api: HfApi, entry: dict) -> int | None:
    try:
        info = api.get_paths_info(entry["repo"], [entry["file"]], revision=entry["revision"])
        return info[0].size if info else None
    except Exception as exc:  # offline or HF hiccup: fall back to "file exists"
        print(f"  ! could not check size of {entry['file']}: {exc}")
        return None


def fetch(entry: dict, models_dir: str, staging_dir: str, api: HfApi) -> str:
    name = os.path.basename(entry["file"])
    dest_dir = os.path.join(models_dir, entry["dest"])
    dest = os.path.join(dest_dir, name)
    os.makedirs(dest_dir, exist_ok=True)

    want = expected_size(api, entry)
    if os.path.exists(dest):
        have = os.path.getsize(dest)
        if want is None or have == want:
            return f"ok (already present)  {entry['dest']}/{name}"
        print(f"  ! {name}: size {have} != expected {want}, re-downloading")

    start = time.time()
    path = hf_hub_download(
        repo_id=entry["repo"],
        filename=entry["file"],
        revision=entry["revision"],
        local_dir=staging_dir,
    )
    shutil.move(path, dest)
    took = time.time() - start
    size = os.path.getsize(dest)
    return f"downloaded {human(size)} in {took:.0f}s  {entry['dest']}/{name}"


def main() -> int:
    manifest_path, models_dir = sys.argv[1], sys.argv[2]
    manifest = json.load(open(manifest_path))
    groups = [g.strip() for g in os.environ.get("MODEL_GROUPS", "").split(",") if g.strip()]
    entries = [m for m in manifest["models"] if not groups or m["group"] in groups]

    # Staging lives on the same disk as the models so the final move is instant.
    staging_dir = os.path.join(models_dir, ".download-staging")
    os.makedirs(staging_dir, exist_ok=True)

    print(f"==> Checking {len(entries)} model files"
          + (f" (groups: {', '.join(groups)})" if groups else " (all groups)"))
    api = HfApi()
    failed = []
    workers = int(os.environ.get("DOWNLOAD_WORKERS", "4"))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch, e, models_dir, staging_dir, api): e for e in entries}
        for fut in as_completed(futures):
            entry = futures[fut]
            try:
                print("  " + fut.result(), flush=True)
            except Exception as exc:
                failed.append(entry["file"])
                print(f"  X FAILED {entry['file']}: {exc}", flush=True)

    if failed:
        print(f"==> {len(failed)} download(s) failed. ComfyUI will still start; "
              "restart the pod to retry. Missing: " + ", ".join(failed))
        return 1
    shutil.rmtree(staging_dir, ignore_errors=True)
    print("==> All models ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
