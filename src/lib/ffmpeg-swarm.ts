"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { needsMp3Playback } from "@/lib/audio-format";

type ConvertProgress = (ratio: number) => void;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let progressHandler: ((event: { progress: number }) => void) | null = null;

const LOCAL_FFMPEG = "/ffmpeg/0.12.10";
const CORE_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const FFMPEG_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm";

async function localAssetsOk() {
  try {
    const res = await fetch(`${LOCAL_FFMPEG}/ffmpeg-core.js`, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function blobWorkerURL() {
  const [workerSrc, constSrc, errorsSrc] = await Promise.all([
    fetch(`${FFMPEG_CDN}/worker.js`).then((r) => {
      if (!r.ok) throw new Error(`worker.js ${r.status}`);
      return r.text();
    }),
    fetch(`${FFMPEG_CDN}/const.js`).then((r) => {
      if (!r.ok) throw new Error(`const.js ${r.status}`);
      return r.text();
    }),
    fetch(`${FFMPEG_CDN}/errors.js`).then((r) => {
      if (!r.ok) throw new Error(`errors.js ${r.status}`);
      return r.text();
    }),
  ]);
  const constURL = URL.createObjectURL(new Blob([constSrc], { type: "text/javascript" }));
  const errorsURL = URL.createObjectURL(new Blob([errorsSrc], { type: "text/javascript" }));
  const rewritten = workerSrc
    .replaceAll('"./const.js"', JSON.stringify(constURL))
    .replaceAll("'./const.js'", JSON.stringify(constURL))
    .replaceAll('"./errors.js"', JSON.stringify(errorsURL))
    .replaceAll("'./errors.js'", JSON.stringify(errorsURL));
  return URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
}

async function loadConfig() {
  if (await localAssetsOk()) {
    return {
      coreURL: `${window.location.origin}${LOCAL_FFMPEG}/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}${LOCAL_FFMPEG}/ffmpeg-core.wasm`,
      classWorkerURL: `${window.location.origin}${LOCAL_FFMPEG}/worker.js`,
    };
  }
  const [coreURL, wasmURL, classWorkerURL] = await Promise.all([
    toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    blobWorkerURL(),
  ]);
  return { coreURL, wasmURL, classWorkerURL };
}

async function getFfmpeg(onProgress?: ConvertProgress) {
  if (ffmpeg?.loaded) {
    bindProgress(ffmpeg, onProgress);
    return ffmpeg;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const instance = new FFmpeg();
      const config = await loadConfig();
      await instance.load(config);
      ffmpeg = instance;
      return instance;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  const instance = await loadPromise;
  bindProgress(instance, onProgress);
  return instance;
}

function bindProgress(instance: FFmpeg, onProgress?: ConvertProgress) {
  if (progressHandler) instance.off("progress", progressHandler);
  progressHandler = null;
  if (onProgress) {
    progressHandler = ({ progress }) => onProgress(Math.min(Math.max(progress, 0), 1));
    instance.on("progress", progressHandler);
  }
}

function inputName(filename: string) {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : ".wav";
  const safe = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".wav";
  return `input${safe}`;
}

async function runConvert(input: Blob, filename: string, onProgress?: ConvertProgress) {
  onProgress?.(0);
  const instance = await getFfmpeg(onProgress);
  const inName = inputName(filename);
  const outName = "output.mp3";
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };
  instance.on("log", onLog);
  await instance.writeFile(inName, await fetchFile(input));
  try {
    const code = await instance.exec([
      "-i",
      inName,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "256k",
      "-ar",
      "44100",
      outName,
    ]);
    if (code !== 0) {
      throw new Error(logs.slice(-8).join(" ") || "Could not convert this file to MP3");
    }
    const data = await instance.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    onProgress?.(1);
    return new File([copy], filename.replace(/\.[^.]+$/, "") + ".mp3", { type: "audio/mpeg" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(detail || "Could not convert this file to MP3");
  } finally {
    instance.off("log", onLog);
    try {
      await instance.deleteFile(inName);
    } catch {
      /* ignore */
    }
    try {
      await instance.deleteFile(outName);
    } catch {
      /* ignore */
    }
  }
}

export function convertToMp3(input: Blob, filename: string, onProgress?: ConvertProgress) {
  const job = queue.then(() => runConvert(input, filename, onProgress));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export async function attachPlaybackFile(data: FormData, file: File, onProgress?: ConvertProgress) {
  data.set("file", file);
  if (!needsMp3Playback(file.name, file.type)) return;
  onProgress?.(0);
  const mp3 = await convertToMp3(file, file.name, onProgress);
  data.set("playback", mp3, mp3.name);
}
