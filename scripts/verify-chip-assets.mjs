import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const chipsDir = path.join(root, "public/chips");
const values = [1, 5, 25, 100, 500, 1000];
const files = values.map((value) => `chip_${value}.svg`);

const missing = [];
let maxBytes = 0;
const source = [];

for (const file of files) {
  const filePath = path.join(chipsDir, file);
  if (!fs.existsSync(filePath)) {
    missing.push(file);
    continue;
  }

  const svg = fs.readFileSync(filePath, "utf8");
  source.push(svg);
  maxBytes = Math.max(maxBytes, Buffer.byteLength(svg, "utf8"));
}

const combined = source.join("\n");
const gzipBytes = gzipSync(combined).byteLength;

const result = {
  expectedCount: files.length,
  presentCount: source.length,
  missing,
  maxSvgBytes: maxBytes,
  maxSvgBudgetBytes: 6 * 1024,
  gzipBundleBytes: gzipBytes,
  gzipBundleBudgetBytes: 50 * 1024,
};

console.log(JSON.stringify(result, null, 2));

if (
  missing.length > 0 ||
  source.length !== files.length ||
  maxBytes > result.maxSvgBudgetBytes ||
  gzipBytes > result.gzipBundleBudgetBytes
) {
  process.exit(1);
}
