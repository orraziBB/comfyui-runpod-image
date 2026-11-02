// Workflow definitions for the image-studio stack.
//
// These are turned into ComfyUI workflow files by tools/build_workflows.mjs, which
// runs the `build` function inside a real ComfyUI page, so the saved .json files are
// exactly what the ComfyUI editor itself would produce.
//
// Everything here uses ComfyUI's built-in nodes only (no custom nodes).

import { T2I_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT } from "./prompts.mjs";

export const DATA = {
  T2I_MOSS: T2I_SYSTEM_PROMPT(180, 300),
  T2I_ZIMAGE: T2I_SYSTEM_PROMPT(120, 220),
  EDIT: EDIT_SYSTEM_PROMPT,
  MODELS: {
    mossUnet: "moss_image_sft_int8_convrot.safetensors",
    mossClip: "qwen3.5_9b_w4a8_gptq.safetensors",
    mossVae: "flux2-vae_small.safetensors",
    mossEditLora: "moss_image_edit_lora_rank_64_bf16.safetensors",
    zUnet: "z_image_turbo_bf16.safetensors",
    zClip: "qwen_3_4b_fp8_mixed.safetensors",
    zVae: "ae.safetensors",
    joyUnet: "joyai_image_edit_plus_int8_convrot.safetensors",
    joyClip: "qwen3vl_8b_joyimage_edit_plus_int8_convrot.safetensors",
    joyVae: "wan_2.1_vae.safetensors",
  },
  NEGATIVE_MOSS: "worst quality, bad anatomy, watermark, jpeg artifact",
};

export const WORKFLOWS = [
  { file: "1 - Generate (MOSS-Image).json", id: "gen_moss" },
  { file: "2 - Generate (Z-Image-Turbo).json", id: "gen_zimage" },
  { file: "3 - Edit with text (JoyAI).json", id: "edit_text_joy" },
  { file: "4 - Edit with multiple images (JoyAI).json", id: "edit_multi_joy" },
  { file: "5 - Edit with text (MOSS, alternative).json", id: "edit_text_moss" },
];

// Runs inside the ComfyUI page. `b` is the helper library from build_workflows.mjs.
// Must be self-contained (no references to anything outside this function).
export function build(b, D, id) {
  const M = D.MODELS;
  const COL_W = 440;          // left column width
  const OUT_X = COL_W + 40;   // output column x
  const OUT_W = 760;
  const ENG_X = OUT_X + OUT_W + 60; // engine group x

  // ---------------------------------------------------------------- shared pieces
  function enhancer({ x, y, userPrompt, enhanceToggle, systemPrompt, image, maxLen }) {
    const clip = b.node("CLIPLoader", { title: "Enhancer model (Qwen3.5-9B)", pos: [x, y],
      w: { clip_name: M.mossClip, type: "moss_image" } });
    const sys = b.node("PrimitiveStringMultiline", { title: "Enhancer instructions (system prompt)", pos: [x, y + 140],
      size: [400, 200], w: { value: systemPrompt } });
    const gen = b.node("TextGenerate", { title: "Prompt enhancer", pos: [x + 440, y], size: [400, 400],
      w: { max_length: maxLen || 1024, sampling_mode: "on", thinking: false } });
    b.link(clip, 0, gen, "clip");
    b.link(sys, 0, gen, "system_prompt");
    b.link(userPrompt, 0, gen, "prompt");
    if (image) b.link(image, 0, gen, "image");
    const sw = b.node("ComfySwitchNode", { title: "Use enhanced prompt?", pos: [x + 440, y + 440] });
    b.link(enhanceToggle, 0, sw, "switch");
    b.link(userPrompt, 0, sw, "on_false");
    b.link(gen, 0, sw, "on_true");
    return { sw, nodes: [clip, sys, gen, sw] };
  }

  function finalPromptPreview(src, pos, size) {
    const p = b.node("PreviewAny", { title: "📝 Final prompt sent to the model", pos, size: size || [OUT_W, 220] });
    b.link(src, 0, p, "source");
    return p;
  }

  // ---------------------------------------------------------------- 1. MOSS text-to-image
  if (id === "gen_moss") {
    b.note(`## 1 · Generate an image (MOSS-Image)
Photoreal **and** illustration / anime / cartoon. Great with text inside images.

**How to use**
1. Type what you want in **✏️ Prompt**. Name the style first, e.g. *"Hand-drawn cartoon of…"* or *"Photo of…"*.
2. Pick the shape in **📐 Size**.
3. Click **Run** (or Ctrl+Enter). Results are saved to \`/workspace/output/generate\`.

**✨ Enhance prompt** (on by default) rewrites a short idea into the long, detailed caption MOSS was trained on. Turn it off to send your exact words. The text actually used shows in **📝 Final prompt**.

**Tips**
- New seed every run. To re-create one, set *control after generate* to **fixed** in 🎛️ Sampler.
- Better quality, slower: steps **50**, cfg **3**.
- If anime looks "over-cooked", open the Engine group and set *Skip-layer guidance* to false.`,
      [0, 0], [COL_W, 470]);
    const prompt = b.node("PrimitiveStringMultiline", { title: "✏️ Prompt", pos: [0, 490], size: [COL_W, 220],
      w: { value: "Hand-drawn cartoon illustration of a cheerful fox adventurer with a leather satchel, standing on a mossy cliff at sunrise, warm colors" } });
    const enh = b.node("PrimitiveBoolean", { title: "✨ Enhance prompt", pos: [0, 730], size: [COL_W, 60], w: { value: true } });
    const res = b.node("ResolutionSelector", { title: "📐 Size", pos: [0, 810], size: [COL_W, 160], w: { multiple: 16 } });
    const latent = b.node("EmptyFlux2LatentImage", { title: "🖼️ Images per run", pos: [0, 990], size: [COL_W, 110], w: { batch_size: 1 } });
    b.link(res, 0, latent, "width"); b.link(res, 1, latent, "height");
    const ks = b.node("KSampler", { title: "🎛️ Sampler", pos: [0, 1120], size: [COL_W, 270],
      w: { seed: 0, control_after_generate: "randomize", steps: 25, cfg: 2.5, sampler_name: "er_sde", scheduler: "simple", denoise: 1 } });

    const save = b.node("SaveImage", { title: "🖼️ Result", pos: [OUT_X, 0], size: [OUT_W, 900], w: { filename_prefix: "generate/moss" } });

    const e = enhancer({ x: ENG_X, y: 40, userPrompt: prompt, enhanceToggle: enh, systemPrompt: D.T2I_MOSS, maxLen: 1024 });
    finalPromptPreview(e.sw, [OUT_X, 920]);

    const unet = b.node("UNETLoader", { pos: [ENG_X, 620], w: { unet_name: M.mossUnet, weight_dtype: "default" } });
    const clip = b.node("CLIPLoader", { pos: [ENG_X, 760], w: { clip_name: M.mossClip, type: "moss_image" } });
    const vae = b.node("VAELoader", { pos: [ENG_X, 900], w: { vae_name: M.mossVae } });
    const slg = b.node("SkipLayerGuidanceDiTSimple", { pos: [ENG_X + 440, 620], w: { double_layers: "", single_layers: "22", start_percent: 0, end_percent: 0.5 } });
    const slgOn = b.node("PrimitiveBoolean", { title: "Skip-layer guidance (official default: true)", pos: [ENG_X + 440, 800], w: { value: true } });
    const slgSw = b.node("ComfySwitchNode", { title: "Skip-layer guidance switch", pos: [ENG_X + 440, 880] });
    b.link(unet, 0, slg, "model");
    b.link(slgOn, 0, slgSw, "switch"); b.link(unet, 0, slgSw, "on_false"); b.link(slg, 0, slgSw, "on_true");
    const pos = b.node("CLIPTextEncode", { title: "Positive", pos: [ENG_X, 1040] });
    const neg = b.node("CLIPTextEncode", { title: "Negative prompt", pos: [ENG_X + 440, 1040], w: { text: D.NEGATIVE_MOSS } });
    b.link(clip, 0, pos, "clip"); b.link(e.sw, 0, pos, "text"); b.link(clip, 0, neg, "clip");
    const dec = b.node("VAEDecode", { pos: [ENG_X, 1300] });
    b.link(slgSw, 0, ks, "model"); b.link(pos, 0, ks, "positive"); b.link(neg, 0, ks, "negative"); b.link(latent, 0, ks, "latent_image");
    b.link(ks, 0, dec, "samples"); b.link(vae, 0, dec, "vae"); b.link(dec, 0, save, "images");
    b.group("⚙️ Engine — nothing to change here", [ENG_X - 20, -20, 900, 1440]);
    return;
  }

  // ---------------------------------------------------------------- 2. Z-Image-Turbo text-to-image
  if (id === "gen_zimage") {
    b.note(`## 2 · Generate an image (Z-Image-Turbo)
Very fast (8 steps), excellent **photorealism**. Also does illustration.

**How to use**
1. Type what you want in **✏️ Prompt** (name the style first: *"Photo of…"*, *"Cartoon of…"*).
2. Pick the shape in **📐 Size**, then **Run**. Results go to \`/workspace/output/generate\`.

**✨ Enhance prompt** (on by default) expands short ideas into a detailed caption, which Z-Image responds to well. Turn it off to send your exact words.

**Tips**
- Z-Image-Turbo has no negative prompt (cfg is 1 by design).
- Keep steps at **8**. More steps doesn't help this model.
- Compare with workflow 1 (MOSS) to see which look you prefer.`,
      [0, 0], [COL_W, 430]);
    const prompt = b.node("PrimitiveStringMultiline", { title: "✏️ Prompt", pos: [0, 450], size: [COL_W, 220],
      w: { value: "Photo of an elderly fisherman mending a net on a wooden dock at golden hour, weathered hands, shallow depth of field" } });
    const enh = b.node("PrimitiveBoolean", { title: "✨ Enhance prompt", pos: [0, 690], size: [COL_W, 60], w: { value: true } });
    const res = b.node("ResolutionSelector", { title: "📐 Size", pos: [0, 770], size: [COL_W, 160], w: { multiple: 16 } });
    const latent = b.node("EmptySD3LatentImage", { title: "🖼️ Images per run", pos: [0, 950], size: [COL_W, 110], w: { batch_size: 1 } });
    b.link(res, 0, latent, "width"); b.link(res, 1, latent, "height");
    const ks = b.node("KSampler", { title: "🎛️ Sampler", pos: [0, 1080], size: [COL_W, 270],
      w: { seed: 0, control_after_generate: "randomize", steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1 } });
    const save = b.node("SaveImage", { title: "🖼️ Result", pos: [OUT_X, 0], size: [OUT_W, 900], w: { filename_prefix: "generate/zimage" } });

    const e = enhancer({ x: ENG_X, y: 40, userPrompt: prompt, enhanceToggle: enh, systemPrompt: D.T2I_ZIMAGE, maxLen: 768 });
    finalPromptPreview(e.sw, [OUT_X, 920]);

    const unet = b.node("UNETLoader", { pos: [ENG_X, 620], w: { unet_name: M.zUnet, weight_dtype: "default" } });
    const clip = b.node("CLIPLoader", { pos: [ENG_X, 760], w: { clip_name: M.zClip, type: "lumina2" } });
    const vae = b.node("VAELoader", { pos: [ENG_X, 900], w: { vae_name: M.zVae } });
    const shift = b.node("ModelSamplingAuraFlow", { pos: [ENG_X + 440, 620], w: { shift: 3 } });
    b.link(unet, 0, shift, "model");
    const pos = b.node("CLIPTextEncode", { title: "Positive", pos: [ENG_X, 1040] });
    b.link(clip, 0, pos, "clip"); b.link(e.sw, 0, pos, "text");
    const zero = b.node("ConditioningZeroOut", { pos: [ENG_X + 440, 1040] });
    b.link(pos, 0, zero, "conditioning");
    const dec = b.node("VAEDecode", { pos: [ENG_X, 1300] });
    b.link(shift, 0, ks, "model"); b.link(pos, 0, ks, "positive"); b.link(zero, 0, ks, "negative"); b.link(latent, 0, ks, "latent_image");
    b.link(ks, 0, dec, "samples"); b.link(vae, 0, dec, "vae"); b.link(dec, 0, save, "images");
    b.group("⚙️ Engine — nothing to change here", [ENG_X - 20, -20, 900, 1440]);
    return;
  }

  // ---------------------------------------------------------------- JoyAI edit (3 and 4)
  if (id === "edit_text_joy" || id === "edit_multi_joy") {
    const multi = id === "edit_multi_joy";
    const N = multi ? 6 : 1;
    const LW = multi ? 660 : COL_W;          // wider left column for 6 image slots
    const OX = LW + 40, EX = OX + OUT_W + 60;
    const ORD = ["first", "second", "third", "fourth", "fifth", "sixth"];

    const help = multi ? `## 4 · Edit with multiple images (JoyAI-Image-Edit-Plus)
Combine up to **6 images**: dress a character, add props, swap backgrounds, or replace one character with another.

**How to use**
1. Load your images into **Image_1 … Image_6**, in order. **Image_1 is the canvas**: the result keeps its shape and framing.
2. Slots 3–6 start **switched off** (purple). To use one, click it and press **Ctrl+B**. Fill slots **in order** with no gaps (don't skip from Image_2 to Image_4).
3. Write your instruction in **✏️ Instruction**, naming images as *Image_1*, *Image_2*, etc. They are converted automatically to the "first image / second image" wording the model was trained on.
4. **Run**. Results go to \`/workspace/output/edit\`.

**Examples**
- *Put the shirt from Image_2 and the hat from Image_3 on the character in Image_1, seat them in the chair from Image_4, in front of the background from Image_5.*
- **Character swap:** put the scene in Image_1 and your character in Image_2: *Replace the person in Image_1 with the character from Image_2. Keep the pose, lighting and background of Image_1.*

**✨ Enhance prompt** (off by default) looks at all your images and rewrites the instruction more precisely. The text actually used shows in **📝 Final prompt**.` : `## 3 · Edit with text (JoyAI-Image-Edit-Plus)
Change one image with a plain instruction: pose, expression, clothing, objects, background, style, text.

**How to use**
1. Load your picture in **Image_1** (drag & drop onto the node, or click *upload*).
2. Write the change in **✏️ Instruction**, e.g. *"Make the character stand up and hold their arms out to the sides."*
3. **Run**. Results go to \`/workspace/output/edit\`.

**Tips**
- Say what to keep: *"…keep the face, outfit and background unchanged."*
- **✨ Enhance prompt** (off by default) looks at your image and rewrites the instruction more precisely.
- Output keeps Image_1's shape at about 1 megapixel (change it in **📐 Output size**).
- Prefer a different look? Try workflow 5 (MOSS edit).`;
    b.note(help, [0, 0], [LW, multi ? 520 : 440]);

    let y = multi ? 540 : 460;
    const images = [];
    const IMG_W = multi ? 320 : LW;
    for (let i = 0; i < N; i++) {
      const col = multi ? i % 2 : 0;
      const row = multi ? Math.floor(i / 2) : 0;
      const img = b.node("LoadImage", { title: `Image_${i + 1}${i === 0 ? " (canvas)" : ""}`,
        pos: [col * (IMG_W + 20), y + row * 380], size: [IMG_W, 360], w: { image: `Image_${i + 1}.png` },
        mode: multi && i >= 2 ? 4 : 0 });
      images.push(img);
    }
    y += multi ? 3 * 380 + 10 : 380;

    const prompt = b.node("PrimitiveStringMultiline", { title: "✏️ Instruction", pos: [0, y], size: [LW, 200],
      w: { value: multi
        ? "Put the character from Image_2 into the scene of Image_1, standing in the center. Keep the character's face, hair and outfit exactly as in Image_2."
        : "Make the character stand up straight and hold their arms out to the sides. Keep the face, outfit and background unchanged." } });
    const enh = b.node("PrimitiveBoolean", { title: "✨ Enhance prompt", pos: [0, y + 220], size: [LW, 60], w: { value: false } });
    const sizeN = b.node("ImageScaleToTotalPixels", { title: "📐 Output size (megapixels)", pos: [0, y + 300], size: [LW, 130],
      w: { upscale_method: "lanczos", megapixels: 1.0, resolution_steps: 16 } });
    b.link(images[0], 0, sizeN, "image");
    const ks = b.node("KSampler", { title: "🎛️ Sampler", pos: [0, y + 450], size: [LW, 270],
      w: { seed: 0, control_after_generate: "randomize", steps: 30, cfg: 4, sampler_name: "euler", scheduler: "normal", denoise: 1 } });

    const save = b.node("SaveImage", { title: "🖼️ Result", pos: [OX, 0], size: [OUT_W, 900],
      w: { filename_prefix: multi ? "edit/joyai-multi" : "edit/joyai-text" } });

    // --- engine
    // Image_N names -> "the first image" etc.
    let text = prompt;
    const renames = [];
    for (let i = N - 1; i >= 0; i--) {
      const r = b.node("RegexReplace", { title: `Image_${i + 1} → "the ${ORD[i]} image"`, pos: [EX, 40 + (N - 1 - i) * 60],
        w: { regex_pattern: `\\b(the\\s+)?image[\\s_-]?${i + 1}\\b`, replace: `the ${ORD[i]} image`, case_insensitive: true },
        collapsed: true });
      b.link(text, 0, r, "string");
      text = r; renames.push(r);
    }

    // Images the enhancer can look at.
    let enhImage = images[0];
    if (multi) {
      const batch = b.node("BatchImagesNode", { title: "All images (for the enhancer)", pos: [EX, 420] });
      images.forEach((img, i) => b.link(img, 0, batch, `images.image${i}`));
      enhImage = batch;
    }
    const e = enhancer({ x: EX, y: 520, userPrompt: text, enhanceToggle: enh, systemPrompt: D.EDIT, image: enhImage, maxLen: 512 });
    finalPromptPreview(e.sw, [OX, 920]);
    if (multi) {
      b.note(`**Image numbering:** the model sees the images that are switched on, in order. If you switch off Image_2 but use Image_3, then "Image_3" in your text would point at the wrong picture. Keep the used slots consecutive.`,
        [OX, 1160], [OUT_W, 110], "⚠️ Note");
    }

    const unet = b.node("UNETLoader", { pos: [EX, 1100], w: { unet_name: M.joyUnet, weight_dtype: "default" } });
    const norm = b.node("CFGNorm", { pos: [EX + 440, 1100], w: { strength: 1, pre_cfg: true } });
    b.link(unet, 0, norm, "model");
    const clip = b.node("CLIPLoader", { pos: [EX, 1240], w: { clip_name: M.joyClip, type: "joyimage" } });
    const vae = b.node("VAELoader", { pos: [EX, 1380], w: { vae_name: M.joyVae } });
    const pos = b.node("TextEncodeJoyImageEdit", { title: "Positive", pos: [EX, 1500], size: [400, 260] });
    const neg = b.node("TextEncodeJoyImageEdit", { title: "Negative prompt", pos: [EX + 440, 1500], size: [400, 260], w: { prompt: "" } });
    for (const enc of [pos, neg]) {
      b.link(clip, 0, enc, "clip"); b.link(vae, 0, enc, "vae");
      images.forEach((img, i) => b.link(img, 0, enc, `images.image${i}`));
    }
    b.link(e.sw, 0, pos, "prompt");
    const dims = b.node("GetImageSize", { pos: [EX, 1800] });
    b.link(sizeN, 0, dims, "image");
    const latent = b.node("EmptySD3LatentImage", { pos: [EX + 440, 1800], w: { batch_size: 1 } });
    b.link(dims, 0, latent, "width"); b.link(dims, 1, latent, "height");
    const dec = b.node("VAEDecode", { pos: [EX, 1960] });
    b.link(norm, 0, ks, "model"); b.link(pos, 0, ks, "positive"); b.link(neg, 0, ks, "negative"); b.link(latent, 0, ks, "latent_image");
    b.link(ks, 0, dec, "samples"); b.link(vae, 0, dec, "vae"); b.link(dec, 0, save, "images");
    if (!multi) {
      const cmp = b.node("ImageCompare", { title: "↔️ Before / after", pos: [OX, 1160], size: [OUT_W, 700] });
      b.link(images[0], 0, cmp, "image_a"); b.link(dec, 0, cmp, "image_b");
    }
    b.group("⚙️ Engine — nothing to change here", [EX - 20, -20, 900, 2100]);
    return;
  }

  // ---------------------------------------------------------------- 5. MOSS edit LoRA
  if (id === "edit_text_moss") {
    b.note(`## 5 · Edit with text (MOSS-Image Edit, alternative)
A second single-image editor, using MOSS-Image with its official edit LoRA. Use it if JoyAI (workflow 3) refuses something or you prefer this look.

**How to use**
1. Load your picture in **Image_1**.
2. Write the change in **✏️ Instruction**. Be explicit about what stays the same.
3. **Run**. Results go to \`/workspace/output/edit\`.

**✨ Enhance prompt** (off by default) looks at your image and rewrites the instruction more precisely.`,
      [0, 0], [COL_W, 330]);
    const img = b.node("LoadImage", { title: "Image_1", pos: [0, 350], size: [COL_W, 360], w: { image: "Image_1.png" } });
    const prompt = b.node("PrimitiveStringMultiline", { title: "✏️ Instruction", pos: [0, 730], size: [COL_W, 200],
      w: { value: "Make the character stand up straight and hold their arms out to the sides. Keep the face, outfit and background unchanged." } });
    const enh = b.node("PrimitiveBoolean", { title: "✨ Enhance prompt", pos: [0, 950], size: [COL_W, 60], w: { value: false } });
    const sizeN = b.node("ImageScaleToTotalPixels", { title: "📐 Output size (megapixels)", pos: [0, 1030], size: [COL_W, 130],
      w: { upscale_method: "lanczos", megapixels: 1.0, resolution_steps: 16 } });
    b.link(img, 0, sizeN, "image");
    const ks = b.node("KSampler", { title: "🎛️ Sampler", pos: [0, 1180], size: [COL_W, 270],
      w: { seed: 0, control_after_generate: "randomize", steps: 30, cfg: 4, sampler_name: "euler", scheduler: "normal", denoise: 1 } });
    const save = b.node("SaveImage", { title: "🖼️ Result", pos: [OUT_X, 0], size: [OUT_W, 900], w: { filename_prefix: "edit/moss-text" } });

    const e = enhancer({ x: ENG_X, y: 40, userPrompt: prompt, enhanceToggle: enh, systemPrompt: D.EDIT, image: sizeN, maxLen: 512 });
    finalPromptPreview(e.sw, [OUT_X, 920]);

    const unet = b.node("UNETLoader", { pos: [ENG_X, 620], w: { unet_name: M.mossUnet, weight_dtype: "default" } });
    const lora = b.node("LoraLoaderModelOnly", { pos: [ENG_X + 440, 620], w: { lora_name: M.mossEditLora, strength_model: 1 } });
    b.link(unet, 0, lora, "model");
    const slg = b.node("SkipLayerGuidanceDiTSimple", { pos: [ENG_X + 440, 760], w: { double_layers: "", single_layers: "22", start_percent: 0, end_percent: 1 } });
    b.link(lora, 0, slg, "model");
    const clip = b.node("CLIPLoader", { pos: [ENG_X, 760], w: { clip_name: M.mossClip, type: "moss_image" } });
    const vae = b.node("VAELoader", { pos: [ENG_X, 900], w: { vae_name: M.mossVae } });
    const pos = b.node("TextEncodeMOSSImageEdit", { title: "Positive", pos: [ENG_X, 1040], size: [400, 220] });
    const neg = b.node("TextEncodeMOSSImageEdit", { title: "Negative prompt", pos: [ENG_X + 440, 1040], size: [400, 220], w: { prompt: D.NEGATIVE_MOSS } });
    for (const enc of [pos, neg]) {
      b.link(clip, 0, enc, "clip"); b.link(vae, 0, enc, "vae"); b.link(sizeN, 0, enc, "images.image_0");
    }
    b.link(e.sw, 0, pos, "prompt");
    const dims = b.node("GetImageSize", { pos: [ENG_X, 1300] });
    b.link(sizeN, 0, dims, "image");
    const latent = b.node("EmptyFlux2LatentImage", { pos: [ENG_X + 440, 1300], w: { batch_size: 1 } });
    b.link(dims, 0, latent, "width"); b.link(dims, 1, latent, "height");
    const dec = b.node("VAEDecode", { pos: [ENG_X, 1460] });
    b.link(slg, 0, ks, "model"); b.link(pos, 0, ks, "positive"); b.link(neg, 0, ks, "negative"); b.link(latent, 0, ks, "latent_image");
    b.link(ks, 0, dec, "samples"); b.link(vae, 0, dec, "vae"); b.link(dec, 0, save, "images");
    const cmp = b.node("ImageCompare", { title: "↔️ Before / after", pos: [OUT_X, 1160], size: [OUT_W, 700] });
    b.link(img, 0, cmp, "image_a"); b.link(dec, 0, cmp, "image_b");
    b.group("⚙️ Engine — nothing to change here", [ENG_X - 20, -20, 900, 1600]);
    return;
  }

  throw new Error("unknown workflow id " + id);
}
