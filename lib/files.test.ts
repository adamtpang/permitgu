import assert from "node:assert/strict";
import test from "node:test";
import { sniffUpload } from "./files";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

test("upload allowlist checks the extension and the file bytes", () => {
  assert.deepEqual(sniffUpload("plans.pdf", pdf), { mime: "application/pdf" });
  assert.deepEqual(sniffUpload("plot.PNG", png), { mime: "image/png" });
  assert.deepEqual(sniffUpload("photo.jpeg", jpeg), { mime: "image/jpeg" });
  assert.deepEqual(sniffUpload("sheet.webp", webp), { mime: "image/webp" });
  assert.equal(sniffUpload("plans.pdf", png), null);
  assert.equal(sniffUpload("notes.html", new TextEncoder().encode("<html></html>")), null);
  assert.equal(sniffUpload("../plans.pdf", pdf), null);
  assert.equal(sniffUpload("plans.exe", pdf), null);
  assert.equal(sniffUpload("no-extension", pdf), null);
});
