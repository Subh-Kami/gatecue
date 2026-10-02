import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
mkdirSync("dist/views", { recursive: true });

// Noto Sans (SIL Open Font License), inlined so cards need no network (Alexa+ layout guide: one self-contained bundle).
const fontDir = require.resolve("@fontsource/noto-sans/package.json").replace(/package\.json$/, "files/");
const face = (w) => `@font-face{font-family:"GC Sans";font-weight:${w};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${readFileSync(`${fontDir}noto-sans-latin-${w}-normal.woff2`).toString("base64")}) format("woff2")}`;
const fonts = [400, 500, 600].map(face).join("\n");
const shared = ["tokens", "motion", "art"].map((n) => readFileSync(`views/shared/${n}.css`, "utf8")).join("\n");

const assets = existsSync("assets/manifest.json") ? JSON.parse(readFileSync("assets/manifest.json", "utf8")) : {};
const assetScript = `<script>window.GC_ASSETS={base:"__GC_ASSET_BASE__",m:${JSON.stringify(assets)}}</script>`;
const names = readdirSync("views").filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const manifest = {};
for (const name of names) {
  const out = await build({ entryPoints: [`views/${name}.ts`], bundle: true, format: "esm", target: "es2022", minify: true, write: false, platform: "browser" });
  const js = out.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
  const own = existsSync(`views/${name}.css`) ? readFileSync(`views/${name}.css`, "utf8") : "";
  const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GateCue ${name}</title><style>${fonts}\n${shared}\n${own}</style></head><body><main id="root" aria-live="polite"></main>${assetScript}<script type="module">${js}</script></body></html>`;
  const hash = createHash("sha256").update(html).digest("hex").slice(0, 8);
  const file = `${name}-${hash}.html`;
  writeFileSync(`dist/views/${file}`, html);
  manifest[name] = { uri: `ui://gatecue/${file}`, file };
  console.log(`built ${file} (${(html.length / 1024).toFixed(1)} KB)`);
}
writeFileSync("dist/views/manifest.json", JSON.stringify(manifest, null, 2));
