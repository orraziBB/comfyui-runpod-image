// Build (and validate) a stack's workflow files inside a real ComfyUI page.
//
//   1. Start a dev server:   tools/dev_server.sh <ComfyUI checkout> image-studio
//   2. Run:                  node tools/build_workflows.mjs image-studio [http://127.0.0.1:8188]
//
// For each workflow it: builds the graph with the ComfyUI editor's own API, saves the
// editor's serialized JSON to stacks/<stack>/workflows/, reloads that file, converts it
// to an API prompt and asks the server to validate it (POST /prompt). Execution is then
// cancelled; only validation matters here (the dev server has no real models).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stack = process.argv[2] || "image-studio";
const url = process.argv[3] || "http://127.0.0.1:8188";
const { WORKFLOWS, DATA, build } = await import(path.join(ROOT, "stacks", stack, "workflows.mjs"));
const outDir = path.join(ROOT, "stacks", stack, "workflows");
mkdirSync(outDir, { recursive: true });

// Helper library injected into the page.
const HELPERS = `
window.__mkHelpers = function () {
  const app = window.app;
  const LG = window.LiteGraph;
  const graph = app.graph;
  function setWidget(n, name, value) {
    const w = (n.widgets || []).find((x) => x.name === name);
    if (!w) throw new Error(n.type + ": no widget '" + name + "'. Has: " + (n.widgets || []).map((x) => x.name).join(", "));
    w.value = value;
    if (w.callback) { try { w.callback(value, app.canvas, n); } catch (e) {} }
  }
  const b = {
    node(type, o = {}) {
      const n = LG.createNode(type);
      if (!n) throw new Error("unknown node type " + type);
      graph.add(n);
      if (o.title) n.title = o.title;
      n.pos = o.pos || [0, 0];
      for (const [k, v] of Object.entries(o.w || {})) setWidget(n, k, v);
      if (o.size) n.size = [Math.max(o.size[0], n.size[0]), Math.max(o.size[1], n.computeSize ? n.computeSize()[1] : 0)];
      if (o.mode !== undefined) n.mode = o.mode;
      if (o.collapsed) n.collapse(true);
      return n;
    },
    link(src, out, dst, inp) {
      const outIdx = typeof out === "number" ? out : src.outputs.findIndex((x) => x.name === out);
      let inIdx = dst.inputs.findIndex((x) => x.name === inp);
      if (inIdx < 0) {
        // widget inputs may need converting into sockets in some frontends
        inIdx = dst.inputs.findIndex((x) => x.widget && x.widget.name === inp);
      }
      if (outIdx < 0 || inIdx < 0) throw new Error("bad link " + src.type + "[" + out + "] -> " + dst.type + "[" + inp + "]. inputs: " + dst.inputs.map((x) => x.name).join(", "));
      const l = src.connect(outIdx, dst, inIdx);
      if (!l) throw new Error("connect failed " + src.type + "[" + out + "] -> " + dst.type + "[" + inp + "]");
      return l;
    },
    note(text, pos, size, title) {
      const n = b.node("MarkdownNote", { pos, title: title || "📖 Read me" });
      setWidget(n, n.widgets[0].name, text);
      n.size = size;
      return n;
    },
    group(title, rect) {
      const g = new LG.LGraphGroup(title);
      g.pos = [rect[0], rect[1]]; g.size = [rect[2], rect[3]];
      graph.add(g);
      return g;
    },
  };
  return b;
};
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
await page.goto(url);
await page.waitForFunction(() => window.app && window.app.graph && window.LiteGraph && window.LiteGraph.createNode, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.addScriptTag({ content: HELPERS });

let failures = 0;
for (const wf of WORKFLOWS) {
  console.log(`\n== ${wf.file}`);
  // 1. build
  const json = await page.evaluate(({ buildSrc, D, id }) => {
    window.app.graph.clear();
    const b = window.__mkHelpers();
    const fn = new Function("return (" + buildSrc + ")")();
    fn(b, D, id);
    window.app.graph.setDirtyCanvas(true, true);
    return window.app.graph.serialize();
  }, { buildSrc: build.toString(), D: DATA, id: wf.id });
  writeFileSync(path.join(outDir, wf.file), JSON.stringify(json, null, 2) + "\n");
  console.log(`  saved (${json.nodes.length} nodes, ${json.links.length} links)`);

  // 2. reload the saved file the way a user would, convert to API format, validate.
  const res = await page.evaluate(async (wfJson) => {
    await window.app.loadGraphData(wfJson, true, true, "check");
    const p = await window.app.graphToPrompt();
    const r = await fetch("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p.output, client_id: "builder" }) });
    const body = await r.json();
    await fetch("/interrupt", { method: "POST" });
    await fetch("/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) });
    return { status: r.status, body, nodes: Object.keys(p.output).length, api: p.output };
  }, json);
  if (res.status === 200 && !(res.body.node_errors && Object.keys(res.body.node_errors).length)) {
    console.log(`  VALID (${res.nodes} executable nodes)`);
  } else {
    failures++;
    console.log(`  INVALID: ${JSON.stringify(res.body, null, 1).slice(0, 4000)}`);
  }
  writeFileSync(path.join("/tmp", `api_${wf.id}.json`), JSON.stringify(res.api, null, 2));
  await page.screenshot({ path: path.join("/tmp", `wf_${wf.id}.png`) });
}
await browser.close();
process.exit(failures ? 1 : 0);
