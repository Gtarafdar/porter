import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertAllowed } from "./files.js";

const CHUNK = 1024 * 1024; // 1 MiB

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
export function copyFileResumable(
  source: string,
  dest: string,
): { bytes: number; sha256: string; skipped: boolean } {
  assertAllowed(source, "copy");
  const src = path.resolve(source);
  const dst = path.resolve(dest);
  const srcStat = fs.statSync(src);
  if (fs.existsSync(dst)) {
    const dstStat = fs.statSync(dst);
    if (dstStat.size === srcStat.size) {
      const a = sha256Buffer(fs.readFileSync(src));
      const b = sha256Buffer(fs.readFileSync(dst));
      if (a === b) return { bytes: dstStat.size, sha256: a, skipped: true };
    }
  }
  const result = copyFileChunked(source, dest);
  return { ...result, skipped: false };
}
