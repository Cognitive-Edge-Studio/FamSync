// Removes a plain white background: flood-fills near-white pixels connected to the border, then softens the edge.
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info, n = width * height;
const whiteness = (i) => Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
const spread = (i) => Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) - whiteness(i);
const background = new Uint8Array(n), queue = [];
const near = (i) => whiteness(i) >= 246 && spread(i) <= 8;
for (let x = 0; x < width; x++) for (const y of [0, height - 1]) { const i = y * width + x; if (near(i) && !background[i]) { background[i] = 1; queue.push(i); } }
for (let y = 0; y < height; y++) for (const x of [0, width - 1]) { const i = y * width + x; if (near(i) && !background[i]) { background[i] = 1; queue.push(i); } }
while (queue.length) {
  const i = queue.pop(), x = i % width, y = (i / width) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const j = ny * width + nx; if (!background[j] && near(j)) { background[j] = 1; queue.push(j); }
  }
}
const out = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  out[i * 4] = data[i * 3]; out[i * 4 + 1] = data[i * 3 + 1]; out[i * 4 + 2] = data[i * 3 + 2];
  let alpha = background[i] ? 0 : 255;
  if (!background[i]) {
    // Pixels touching the background fade with how close to white they are, which removes the white halo.
    const x = i % width, y = (i / width) | 0;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < width && ny < height && background[ny * width + nx]; });
    if (edge) alpha = Math.max(0, Math.min(255, Math.round((255 - whiteness(i)) * 6)));
  }
  out[i * 4 + 3] = alpha;
}
await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(output);
console.log("saved", output, width + "x" + height, "background pixels", background.reduce((a, b) => a + b, 0));
