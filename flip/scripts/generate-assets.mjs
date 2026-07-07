// Generates store / Capacitor source assets from the FLIP brand mark.
// Run: node scripts/generate-assets.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assets = path.join(root, "assets");
const store = path.join(root, "store", "graphics");

const GRAD = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="50%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>`;

// Chiaro mark: clean "C" monogram
const MARK = (cx, cy, scale, color = "#ffffff") => `
  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(-256 -256)" fill="none" stroke="${color}">
    <path d="M352 141 A150 150 0 1 0 352 371" stroke-width="74" stroke-linecap="round"/>
  </g>`;

const iconSquare = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${GRAD}
  <rect width="512" height="512" rx="120" fill="url(#g)"/>
  ${MARK(256, 256, 1)}
</svg>`;

const iconFull = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${GRAD}
  <rect width="512" height="512" fill="url(#g)"/>
  ${MARK(256, 256, 1)}
</svg>`;

const foreground = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${MARK(256, 256, 0.62)}
</svg>`;

const background = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${GRAD}
  <rect width="512" height="512" fill="url(#g)"/>
</svg>`;

const splash = (w, h, bg) => `
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${GRAD}
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${w / 2} ${h / 2 - 80})">
    <rect x="-160" y="-160" width="320" height="320" rx="80" fill="url(#g)"/>
    ${MARK(0, 0, 0.6)}
  </g>
  <text x="${w / 2}" y="${h / 2 + 180}" text-anchor="middle" font-family="Arial, sans-serif" font-size="84" font-weight="800" fill="#059669">FLIP</text>
  <text x="${w / 2}" y="${h / 2 + 250}" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="${bg === "#0f172a" ? "#cbd5e1" : "#475569"}">Non ti fregano più!</text>
</svg>`;

const png = (svg) => sharp(Buffer.from(svg)).png();

const jobs = [
  // Capacitor source assets (consumed by `npx capacitor-assets generate`)
  ["assets/icon-only.png", iconSquare(1024)],
  ["assets/icon-foreground.png", foreground(1024)],
  ["assets/icon-background.png", background(1024)],
  ["assets/splash.png", splash(2732, 2732, "#eef2f8")],
  ["assets/splash-dark.png", splash(2732, 2732, "#0f172a")],
  // Ready-to-upload store icons
  ["store/graphics/appstore-icon-1024.png", iconFull(1024)],
  ["store/graphics/playstore-icon-512.png", iconFull(512)],
  ["store/graphics/playstore-feature-graphic-1024x500.png", splash(1024, 500, "#eef2f8")],
];

await mkdir(assets, { recursive: true });
await mkdir(store, { recursive: true });

for (const [rel, svg] of jobs) {
  const out = path.join(root, rel);
  await png(svg).toFile(out);
  console.log("✓", rel);
}
console.log("Done.");
