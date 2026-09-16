import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "public", "ffmpeg", "0.12.10");

function copy(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing ${from}. Run npm install first.`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const coreDir = path.join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const workerDir = path.join(root, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");
copy(path.join(coreDir, "ffmpeg-core.js"), path.join(dest, "ffmpeg-core.js"));
copy(path.join(coreDir, "ffmpeg-core.wasm"), path.join(dest, "ffmpeg-core.wasm"));
copy(path.join(workerDir, "worker.js"), path.join(dest, "worker.js"));
copy(path.join(workerDir, "const.js"), path.join(dest, "const.js"));
copy(path.join(workerDir, "errors.js"), path.join(dest, "errors.js"));

console.log("Copied ffmpeg.wasm core to public/ffmpeg");
