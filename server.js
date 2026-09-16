/**
 * cPanel / shared-hosting entrypoint.
 * Prefer Application startup file: app.js (cPanel default) or server.js
 * Then run: npm install && npm run build && Restart App
 */
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");

// Passenger/cPanel often starts with a cwd that is not the app root.
try {
  process.chdir(__dirname);
} catch {
  /* ignore */
}
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(__dirname, "data");
}

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

function ensureFfmpegPublic() {
  const dest = path.join(__dirname, "public", "ffmpeg", "0.12.10");
  const wasm = path.join(dest, "ffmpeg-core.wasm");
  try {
    if (fs.existsSync(wasm) && fs.statSync(wasm).size > 1_000_000) return;
    const coreDir = path.join(__dirname, "node_modules", "@ffmpeg", "core", "dist", "esm");
    const workerDir = path.join(__dirname, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");
    fs.mkdirSync(dest, { recursive: true });
    for (const [from, name] of [
      [path.join(coreDir, "ffmpeg-core.js"), "ffmpeg-core.js"],
      [path.join(coreDir, "ffmpeg-core.wasm"), "ffmpeg-core.wasm"],
      [path.join(workerDir, "worker.js"), "worker.js"],
      [path.join(workerDir, "const.js"), "const.js"],
      [path.join(workerDir, "errors.js"), "errors.js"],
    ]) {
      if (!fs.existsSync(from)) throw new Error(`Missing ${from}`);
      fs.copyFileSync(from, path.join(dest, name));
    }
    console.log("[arp] copied ffmpeg.wasm to public/ffmpeg");
  } catch (err) {
    console.error("[arp] ffmpeg copy failed (CDN fallback will be used)", err);
  }
}

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    ensureFfmpegPublic();

    createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl).catch((err) => {
        console.error("Request error", req.url, err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    }).listen(port, hostname, () => {
      console.log(`Audio Review Portal ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start Next.js", err);
    process.exit(1);
  });
