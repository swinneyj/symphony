import { readFile } from "node:fs/promises";

export function dimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString() === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("hex") === "52494646" && bytes.subarray(8, 12).toString() === "WEBP") {
    const kind = bytes.subarray(12, 16).toString();
    if (kind === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

export async function fileAsDataUri(path: string): Promise<string> {
  const bytes = await readFile(path);
  const ext = path.toLowerCase().split(".").pop();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export function aspectRatioForFal(value: string): string {
  const [w, h] = value.split("x").map(Number);
  const ratio = w / h;
  const choices: Array<[string, number]> = [
    ["1:1", 1], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:3", 4 / 3],
    ["3:4", 3 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3], ["4:5", 4 / 5], ["5:4", 5 / 4],
  ];
  return choices.sort((a, b) => Math.abs(a[1] - ratio) - Math.abs(b[1] - ratio))[0][0];
}
