const MAX_BYTES = 20 * 1024 * 1024;

const TYPES = [
  { mime: "application/pdf", extensions: ["pdf"], magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", extensions: ["png"], magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], magic: [0xff, 0xd8, 0xff] },
  {
    mime: "image/webp",
    extensions: ["webp"],
    magic: [0x52, 0x49, 0x46, 0x46],
    extraOffset: 8,
    extra: [0x57, 0x45, 0x42, 0x50],
  },
] as const;

export const MAX_UPLOAD_BYTES = MAX_BYTES;
export const ALLOWED_UPLOAD_MIMES = TYPES.map((type) => type.mime);

function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0) {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((value, index) => bytes[offset + index] === value);
}

export function sniffUpload(fileName: string, bytes: Uint8Array): { mime: string } | null {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES) return null;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!extension || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return null;
  for (const type of TYPES) {
    if (!type.extensions.includes(extension as never)) continue;
    if (!startsWith(bytes, type.magic)) continue;
    if ("extra" in type && !startsWith(bytes, type.extra, type.extraOffset)) continue;
    return { mime: type.mime };
  }
  return null;
}

export function safeStorageName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^\.+/, "");
  return cleaned.slice(0, 80) || "file";
}
