// Makes the Android icon set from apps/mobile/assets/icon.png. Run from the project folder: node scripts/make-app-icons.mjs
import sharp from 'sharp';

const assets = new URL('../apps/mobile/assets/', import.meta.url), file = (name) => decodeURIComponent(new URL(name, assets).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const { data, info } = await sharp(file('icon.png')).flatten({ background: '#f5f5f4' }).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info, outside = new Uint8Array(width * height), queue = [];
// The background is whatever touches the edge and is close to its color, so the pale walls stay.
const near = (i) => Math.abs(data[i * channels] - data[0]) + Math.abs(data[i * channels + 1] - data[1]) + Math.abs(data[i * channels + 2] - data[2]) < 14;
const visit = (i) => { if (!outside[i] && near(i)) { outside[i] = 1; queue.push(i); } };
for (let x = 0; x < width; x += 1) { visit(x); visit((height - 1) * width + x); }
for (let y = 0; y < height; y += 1) { visit(y * width); visit(y * width + width - 1); }
while (queue.length) { const i = queue.pop(), x = i % width; if (x) visit(i - 1); if (x < width - 1) visit(i + 1); if (i >= width) visit(i - width); if (i < width * (height - 1)) visit(i + width); }
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i += 1) { for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = data[i * channels + c]; rgba[i * 4 + 3] = outside[i] ? 0 : 255; }
// The edge is cut one pixel inside and softened, so none of the old background shows.
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  let inside = 0;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) { const at = Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx)); if (!outside[at]) inside += 1; }
  rgba[(y * width + x) * 4 + 3] = Math.round(Math.min(1, Math.max(0, (inside / 25 - 0.5) * 2)) * 255);
}
const cut = await sharp(rgba, { raw: { width, height, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();

const centered = async (art, canvas, part, background = { r: 0, g: 0, b: 0, alpha: 0 }) => sharp({ create: { width: canvas, height: canvas, channels: 4, background } })
  .composite([{ input: await sharp(art).resize({ width: Math.round(canvas * part), height: Math.round(canvas * part), fit: 'inside' }).png().toBuffer(), gravity: 'centre' }]).png({ compressionLevel: 9 });
// Launchers crop adaptive icons to a circle of about 61% of the canvas, so the house stays inside it.
await (await centered(cut, 1024, 0.5)).toFile(file('adaptive-foreground.png'));
await (await centered(cut, 1024, 0.9)).toFile(file('splash.png'));
// The plain icon fills more of its square.
await sharp(await (await centered(cut, 1024, 0.74, '#eef3ec')).toBuffer()).flatten({ background: '#eef3ec' }).png({ compressionLevel: 9 }).toFile(file('launcher.png'));

// One-color versions: Android tints these, so only their shape matters.
const shape = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" fill="#fff" d="M50 8 Q53 8 56 10.500 L66 19 V13 a4 4 0 0 1 4-4 h6 a4 4 0 0 1 4 4 V31 L93 42 a8 8 0 0 1-6 14 V84 a9 9 0 0 1-9 9 H22 a9 9 0 0 1-9-9 V56 a8 8 0 0 1-6-14 L44 10.500 Q47 8 50 8 Z M26 93 V66 a11 11 0 0 1 22 0 V93 Z M58 56 h16 a4 4 0 0 1 4 4 v12 a4 4 0 0 1-4 4 H58 a4 4 0 0 1-4-4 V60 a4 4 0 0 1 4-4 Z"/></svg>');
const white = await sharp(shape, { density: 900 }).png().toBuffer();
await (await centered(white, 1024, 0.46)).toFile(file('adaptive-monochrome.png'));
await (await centered(white, 96, 0.88)).toFile(file('notification.png'));
console.log('Icons written.');
