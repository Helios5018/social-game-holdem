import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templatePath = path.join(root, "src/assets/chips/templates/chip-template.svg");
const outputDir = path.join(root, "public/chips");

const CHIP_STYLES = {
  1: { outer: "#0f172a", inner: "#111827", innerHighlight: "#1f2937", ring: "#cbd5e1", text: "#f8fafc" },
  5: { outer: "#7f1d1d", inner: "#991b1b", innerHighlight: "#dc2626", ring: "#fecaca", text: "#fff1f2" },
  25: { outer: "#14532d", inner: "#166534", innerHighlight: "#22c55e", ring: "#bbf7d0", text: "#f0fdf4" },
  100: { outer: "#1e3a8a", inner: "#1d4ed8", innerHighlight: "#60a5fa", ring: "#bfdbfe", text: "#eff6ff" },
  500: { outer: "#6b21a8", inner: "#7e22ce", innerHighlight: "#c084fc", ring: "#e9d5ff", text: "#faf5ff" },
  1000: { outer: "#92400e", inner: "#b45309", innerHighlight: "#f59e0b", ring: "#fde68a", text: "#fffbeb" },
};

const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];

const template = fs.readFileSync(templatePath, "utf8");
fs.mkdirSync(outputDir, { recursive: true });

for (const value of CHIP_VALUES) {
  const style = CHIP_STYLES[value];
  if (!style) {
    throw new Error(`Missing style for chip value ${value}`);
  }

  const svg = template
    .replaceAll("__VALUE__", String(value))
    .replaceAll("__OUTER__", style.outer)
    .replaceAll("__INNER__", style.inner)
    .replaceAll("__INNER_HIGHLIGHT__", style.innerHighlight)
    .replaceAll("__RING__", style.ring)
    .replaceAll("__TEXT__", style.text);

  fs.writeFileSync(path.join(outputDir, `chip_${value}.svg`), svg, "utf8");
}

console.log(`Generated ${CHIP_VALUES.length} chip SVG files in ${outputDir}`);
