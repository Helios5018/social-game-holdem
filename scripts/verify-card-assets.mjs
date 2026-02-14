import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const suits = ["spades", "hearts", "diamonds", "clubs"];

const frontDir = path.join(root, "public/cards/front");
const backCardPath = path.join(root, "public/cards/back/default.svg");

const missing = [];
let maxBytes = 0;

for (const suit of suits) {
  for (const rank of ranks) {
    const filePath = path.join(frontDir, `${rank}_${suit}.svg`);
    if (!fs.existsSync(filePath)) {
      missing.push(`${rank}_${suit}`);
      continue;
    }

    const size = fs.statSync(filePath).size;
    maxBytes = Math.max(maxBytes, size);
  }
}

if (!fs.existsSync(backCardPath)) {
  missing.push("back/default");
}

const files = fs
  .readdirSync(frontDir)
  .filter((file) => file.endsWith(".svg"))
  .map((file) => fs.readFileSync(path.join(frontDir, file), "utf8"));
files.push(fs.readFileSync(backCardPath, "utf8"));

const bundleBytes = Buffer.byteLength(files.join("\n"), "utf8");
const gzipBytes = gzipSync(files.join("\n")).byteLength;

const result = {
  expectedFrontCount: ranks.length * suits.length,
  currentFrontCount: fs.readdirSync(frontDir).filter((file) => file.endsWith(".svg")).length,
  missing,
  largestFrontSvgBytes: maxBytes,
  budgetPerCardBytes: 6 * 1024,
  bundleRawBytes: bundleBytes,
  bundleGzipBytes: gzipBytes,
  budgetBundleGzipBytes: 300 * 1024,
};

console.log(JSON.stringify(result, null, 2));

if (
  missing.length > 0 ||
  result.currentFrontCount !== result.expectedFrontCount ||
  maxBytes > result.budgetPerCardBytes ||
  gzipBytes > result.budgetBundleGzipBytes
) {
  process.exit(1);
}
