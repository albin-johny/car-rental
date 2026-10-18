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

// ---- iOS launch (splash) screens: light background with the icon in the middle, one image per device size ----
import { readFileSync, mkdirSync } from "node:fs";
const devices = JSON.parse(readFileSync("src/lib/splash-screens.json", "utf8"));
mkdirSync("public/splash", { recursive: true });
const BG = { r: 248, g: 250, b: 252 }; // same as the manifest background_color (#f8fafc)
for (const d of devices) {
  const landscape = d.o === "landscape";
  const W = (landscape ? d.h : d.w) * d.r, H = (landscape ? d.w : d.h) * d.r;
  const size = Math.round(Math.min(W, H) * 0.3), radius = Math.round(size * 0.225);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`);
  const icon = await sharp(base).resize(size, size).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const blur = Math.round(size * 0.04), pad = blur * 4;
  const shadow = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 0.22 } } })
    .composite([{ input: mask, blend: "dest-in" }]).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(blur).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
    .composite([
      { input: shadow, left: Math.round((W - size) / 2) - pad, top: Math.round((H - size) / 2) - pad + Math.round(size * 0.03) },
      { input: icon, left: Math.round((W - size) / 2), top: Math.round((H - size) / 2) },
    ])
    .png({ palette: false, compressionLevel: 9 }).toFile(`public/splash/${W}x${H}.png`);
}
console.log(`${devices.length} splash screens written to public/splash`);
