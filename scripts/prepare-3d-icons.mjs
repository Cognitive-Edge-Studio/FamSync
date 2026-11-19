import { access, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = 'output/imagegen/famsync-icons';
const destination = 'apps/web/public/icons/3d';
const manifest = JSON.parse(await readFile(`${root}/generation.json`, 'utf8'));
await mkdir(destination, { recursive: true });
const results = [];
for (const { key, source } of manifest.icons) {
  const original = `${root}/${key}.png`;
  try { await access(original); } catch { await copyFile(source, original); }
  const meta = await sharp(original).metadata();
  if (!meta.hasAlpha) throw new Error(`${key} is missing transparency`);
  const sizes = [];
  for (const size of [96, 192]) {
    const info = await sharp(original).trim({ threshold: 12 }).resize(size, size, { fit: 'contain', background: '#00000000' }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(`${destination}/${key}${size === 192 ? '@2x' : ''}.webp`);
    sizes.push({ size, bytes: info.size });
  }
  results.push({ key, sizes });
}
await writeFile(`${root}/asset-sizes.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
