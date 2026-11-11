/**
 * Tend's app icons, drawn once and exported at every size phones and browsers ask for:
 *
 *   node scripts/make-icons.mjs
 *
 * The mark is the clock wall's dial (the same Clock3 glyph as the in-app logo):
 * a white face with a sea ring on Tend's night teal, hands at three o'clock and
 * the red centre of the clocks' second hand.
 */
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const NIGHT = "#103f55";
const SEA = "#89d7dd";
const INK = "#203347";
const RED = "#d23a2c";

/** The dial on a 512 canvas. `scale` shrinks it about the centre (maskable icons need a safe zone). */
const dial = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="170" fill="#ffffff" stroke="${SEA}" stroke-width="28"/>
    <path d="M256 256 V146" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
    <path d="M256 256 H336" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="18" fill="${RED}"/>
  </g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;

// Browsers and installed apps that show the icon as drawn: rounded, with clear corners.
const rounded = svg(`<rect width="512" height="512" rx="112" fill="${NIGHT}"/>${dial()}`);
// iOS rounds the corners itself and fills clear ones with black, so this one is square.
const square = svg(`<rect width="512" height="512" fill="${NIGHT}"/>${dial()}`);
// Android crops maskable icons to its own shape; everything that matters sits inside the middle 80%.
const maskable = svg(`<rect width="512" height="512" fill="${NIGHT}"/>${dial(0.92)}`);
// The status-bar badge: Android keeps only the shape, so a white outline on clear.
const badge = svg(`
  <circle cx="256" cy="256" r="190" fill="none" stroke="#fff" stroke-width="44"/>
  <path d="M256 256 V130" stroke="#fff" stroke-width="44" stroke-linecap="round"/>
  <path d="M256 256 H350" stroke="#fff" stroke-width="44" stroke-linecap="round"/>`);

const png = (source, size, file, { opaque = false } = {}) => {
  const img = sharp(Buffer.from(source)).resize(size, size);
  // Square icons carry no clear pixels at all, so drop the alpha channel iOS would otherwise fill with black.
  return (opaque ? img.flatten({ background: NIGHT }) : img).png().toFile(file);
};

await writeFile("src/app/icon.svg", rounded + "\n");
await png(square, 180, "src/app/apple-icon.png", { opaque: true });
await png(rounded, 192, "public/icon-192.png");
await png(rounded, 512, "public/icon-512.png");
await png(maskable, 512, "public/icon-maskable-512.png", { opaque: true });
await png(badge, 96, "public/badge-96.png");
console.log("Icons written: src/app/icon.svg, src/app/apple-icon.png, public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png, public/badge-96.png");
