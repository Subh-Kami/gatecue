// Card bundles are content-hashed (Alexa+ layout guide: version the ui:// URI with a content hash).
import { readFileSync } from "node:fs";
const manifest: Record<string, { uri: string; file: string }> = JSON.parse(readFileSync(new URL("../dist/views/manifest.json", import.meta.url), "utf8"));
export function viewUri(name: string): string {
  const m = manifest[name];
  if (!m) throw new Error(`Card "${name}" is not built. Run npm run build:views.`);
  return m.uri;
}
// The card's illustrations are served by this server; the build leaves a placeholder for its public origin.
export function viewHtml(name: string, assetBase: string): string {
  return readFileSync(new URL(`../dist/views/${manifest[name].file}`, import.meta.url), "utf8").replace("__GC_ASSET_BASE__", assetBase.replace(/\/$/, ""));
}
export const VIEW_NAMES = Object.keys(manifest);
