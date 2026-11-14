// Reads a gzip-compressed tar archive of a theme or world package (sw-architecture.md 19.7, 14.4).
// Only regular files and folders are accepted; links, devices and extended headers are refused, and
// so are absolute paths and `..`. The reader needs no library: the ustar header is 512 bytes.
import { gunzipSync } from "node:zlib";

export interface TarEntry {
  path: string;
  kind: "file" | "directory";
  data: Buffer;
}

/** A problem with the archive itself: the package cannot be read at all. */
export class TarError extends Error {
  readonly code:
    | "not_gzip"
    | "unpacked_too_large"
    | "not_tar"
    | "entry_type"
    | "entry_path"
    | "entry_duplicate"
    | "too_many_files";
  readonly file: string;

  constructor(code: TarError["code"], file: string, message: string) {
    super(message);
    this.name = "TarError";
    this.code = code;
    this.file = file;
  }
}

const BLOCK = 512;

/** An octal number in a header field (NUL or space padded). */
function octal(field: Buffer): number {
  const text = field.toString("latin1").replace(/\0.*$/s, "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error("not an octal number");
  return Number.parseInt(text, 8);
}

/** A NUL-terminated string field. */
function text(field: Buffer): string {
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

/** The name of a path is safe when it is relative, has no `..` or backslash, and no empty part. */
export function isSafePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export interface ArchiveLimits {
  /** The size of the unpacked archive, in bytes. */
  unpackedBytes: number;
  /** The most entries (files and folders) the archive may hold; no limit when not given. */
  maxEntries?: number;
}

/** A size in bytes as megabytes, for the findings. */
export function megabytes(bytes: number): string {
  return String(bytes / (1024 * 1024));
}

/** Unpacks the archive. Throws a `TarError` for anything that is not a regular, safe archive. */
export function readPackageArchive(gzipped: Buffer, limits: ArchiveLimits): TarEntry[] {
  let tar: Buffer;
  try {
    tar = gunzipSync(gzipped, { maxOutputLength: limits.unpackedBytes });
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE"
    ) {
      throw new TarError(
        "unpacked_too_large",
        "(archive)",
        `the unpacked package is larger than ${megabytes(limits.unpackedBytes)} MB`,
      );
    }
    throw new TarError("not_gzip", "(archive)", "the package is not a gzip-compressed archive");
  }
  const entries: TarEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const stored = octal(header.subarray(148, 156));
    const sum = header.reduce(
      (total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (sum !== stored)
      throw new TarError("not_tar", "(archive)", "a header of the archive is damaged");
    const magic = header.subarray(257, 263).toString("latin1");
    if (!magic.startsWith("ustar"))
      throw new TarError("not_tar", "(archive)", "the archive is not in tar format");
    const size = octal(header.subarray(124, 136));
    // The POSIX magic ("ustar\0") has a name prefix; the GNU magic ("ustar ") has none.
    const prefix = magic === "ustar\0" ? text(header.subarray(345, 500)) : "";
    const name =
      prefix === "" ? text(header.subarray(0, 100)) : `${prefix}/${text(header.subarray(0, 100))}`;
    const type = String.fromCharCode(header[156] ?? 0);
    // The data of an entry must lie inside the archive; a shorter archive is cut short, not read.
    if (offset + BLOCK + size > tar.length) {
      throw new TarError("not_tar", name, "the archive ends inside an entry");
    }
    const body = tar.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (limits.maxEntries !== undefined && entries.length >= limits.maxEntries) {
      throw new TarError(
        "too_many_files",
        name,
        `the archive holds more than ${String(limits.maxEntries)} files and folders`,
      );
    }
    if (type === "5") {
      const folder = name.replace(/\/$/, "");
      if (!isSafePath(folder))
        throw new TarError("entry_path", name, "the path is absolute or contains ..");
      if (seen.has(folder))
        throw new TarError("entry_duplicate", name, "the entry is in the archive twice");
      seen.add(folder);
      entries.push({ path: folder, kind: "directory", data: Buffer.alloc(0) });
      continue;
    }
    if (type !== "0" && type !== "\0") {
      throw new TarError("entry_type", name, "only regular files and folders are allowed");
    }
    if (!isSafePath(name))
      throw new TarError("entry_path", name, "the path is absolute or contains ..");
    if (seen.has(name))
      throw new TarError("entry_duplicate", name, "the file is in the archive twice");
    seen.add(name);
    entries.push({ path: name, kind: "file", data: Buffer.from(body) });
  }
  return entries;
}
