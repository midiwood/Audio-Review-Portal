"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { needsMp3Playback } from "@/lib/audio-format";

type ConvertProgress = (ratio: number) => void;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let progressHandler: ((event: { progress: number }) => void) | null = null;

async function getFfmpeg(onProgress?: ConvertProgress) {
  if (ffmpeg?.loaded) {
    bindProgress(ffmpeg, onProgress);
    return ffmpeg;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const instance = new FFmpeg();
      const base = `${window.location.origin}/ffmpeg/0.12.10`;
      await instance.load({
        coreURL: `${base}/ffmpeg-core.js`,
        wasmURL: `${base}/ffmpeg-core.wasm`,
        classWorkerURL: `${base}/worker.js`,
      });
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
