import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertAllowed, copyFolderLocal as copyFolderFiles } from "./files.js";

const CHUNK = 2 * 1024 * 1024; // 2 MiB — fewer syscalls, better large-file throughput

export type TransferStats = {
  bytes: number;
  files?: number;
  sha256?: string;
  skipped?: boolean;
  chunks?: number;
  ms: number;
  mbps: number;
};

function timed(bytes: number, started: number, extra: Record<string, unknown> = {}): TransferStats {
  const ms = Math.max(1, Math.round(performance.now() - started));
  const mbps = Number(((bytes * 8) / (ms / 1000) / 1_000_000).toFixed(2));
  return { bytes, ms, mbps, ...extra } as TransferStats;
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function copyFileChunked(
  source: string,
  dest: string,
): { bytes: number; sha256: string; chunks: number } {
  assertAllowed(source, "copy");
  assertAllowed(path.dirname(path.resolve(dest)), "write");
  const src = path.resolve(source);
  const dst = path.resolve(dest);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  const hash = createHash("sha256");
  const fdIn = fs.openSync(src, "r");
  const fdOut = fs.openSync(dst, "w");
  let bytes = 0;
  let chunks = 0;
  try {
    const buf = Buffer.alloc(CHUNK);
    let read = 0;
    while ((read = fs.readSync(fdIn, buf, 0, CHUNK, null)) > 0) {
      const slice = buf.subarray(0, read);
      fs.writeSync(fdOut, slice);
      hash.update(slice);
      bytes += read;
      chunks += 1;
    }
  } finally {
    fs.closeSync(fdIn);
    fs.closeSync(fdOut);
  }
  return { bytes, sha256: hash.digest("hex"), chunks };
}

/** Resume-friendly: if dest exists with same size+hash, skip; else rewrite. */
export function copyFileResumable(source: string, dest: string): TransferStats {
  const started = performance.now();
  assertAllowed(source, "copy");
  const src = path.resolve(source);
  const dst = path.resolve(dest);
  const srcStat = fs.statSync(src);
  if (fs.existsSync(dst)) {
    const dstStat = fs.statSync(dst);
    if (dstStat.size === srcStat.size) {
      const a = sha256Buffer(fs.readFileSync(src));
      const b = sha256Buffer(fs.readFileSync(dst));
      if (a === b) return timed(dstStat.size, started, { sha256: a, skipped: true });
    }
  }
  const result = copyFileChunked(source, dest);
  return timed(result.bytes, started, { sha256: result.sha256, chunks: result.chunks, skipped: false });
}

export function copyFolderResumable(source: string, dest: string): TransferStats {
  const started = performance.now();
  const result = copyFolderFiles(source, dest);
  return timed(result.bytes, started, { files: result.files });
}

/** Run async tasks with a concurrency limit (speeds remote multi-file pulls). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]!);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}
