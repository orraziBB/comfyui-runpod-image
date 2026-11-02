# First-hour test checklist

Use real images of your own (a character, a few clothing/prop photos, a background). Note anything odd in the
"Notes" column and send it back. Fixes are usually a one-line change.

The first run of each workflow is slow (the model loads into GPU memory); later runs are much faster.

| # | Test | Workflow | Pass? | Notes / time per image |
|---|---|---|---|---|
| 1 | Photo prompt, enhancer **on** | 1 · Generate (MOSS) | | |
| 2 | Cartoon / hand-drawn prompt, enhancer **on** | 1 · Generate (MOSS) | | |
| 3 | Same two prompts | 2 · Generate (Z-Image) | | Which model do you prefer for each style? |
| 4 | Same prompt with enhancer **off** (check the 📝 Final prompt box changes) | 1 or 2 | | |
| 5 | Pose edit: *"Make the character stand up and hold their arms out to the sides. Keep the face, outfit and background unchanged."* | 3 · Edit with text (JoyAI) | | |
| 6 | Same edit with ✨ enhancer **on** | 3 | | Better or worse? |
| 7 | Same edit | 5 · Edit with text (MOSS) | | Compare with JoyAI |
| 8 | Dress-up: character in Image_1, shirt Image_2, hat Image_3 (turn slot 3 on with Ctrl+B) | 4 · Multi-image | | |
| 9 | Full scene: + chair Image_4 + background Image_5 | 4 | | |
| 10 | **Character swap:** scene with a person in Image_1, your character in Image_2: *"Replace the person in Image_1 with the character from Image_2. Keep the pose, lighting and background of Image_1."* | 4 | | Does the face/identity hold? |
| 11 | Something the models might refuse or water down (whatever you'd normally need) | 1, 2, 3, 4 | | Which, if any, refused or softened it? |
| 12 | (Optional) Repeat one edit test on an RTX 4090 pod | 3 or 4 | | Time per image |

## Things to look at in the logs (pod → Logs)
- `X FAILED` during model download → just restart the pod; downloads resume.
- `torch.OutOfMemoryError` → tell me which workflow and GPU; you can also add `--lowvram` to `COMFYUI_ARGS`.
- `CUDA driver version is insufficient` → redeploy with the **CUDA 13.0+** filter (see RUNPOD_SETUP.md step 4).

## After testing, decide
- Keep both generators (MOSS + Z-Image), or drop one? Dropping saves ~13–18 GB on the volume.
- Keep workflow 5 (MOSS edit)?
- Any default you'd change (enhancer on/off, steps, output size)?
