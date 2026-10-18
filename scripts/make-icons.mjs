// Regenerates the app icons in public/icons from design/app-icon-source.png (a rounded square on white).
// Uses `sharp`, which Next.js already installs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const SRC = "design/app-icon-source.png";
const OUT = "public/icons";
// The artwork is a rounded square inset on a white page. Cut inside it so no white corner survives:
// operating systems apply their own rounded mask, so the icon file itself must be a full-bleed square.
const CROP = { left: 140, top: 140, width: 975, height: 975 };

const base = await sharp(SRC).extract(CROP).toBuffer();

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(base).resize(size, size).png().toFile(`${OUT}/${name}`);
}
// Maskable (Android): the picture must sit inside the central 80% circle, so shrink it and extend the blue edges around it.
const inner = 330, pad = (512 - inner) / 2;
await sharp(base).resize(inner, inner).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: "copy" }).png().toFile(`${OUT}/icon-maskable-512.png`);
console.log("icons written to", OUT);
