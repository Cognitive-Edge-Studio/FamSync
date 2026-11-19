import { access, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const root='output/imagegen/human-avatars', destination='apps/web/public/avatars/3d';
const manifest=JSON.parse(await readFile(`${root}/generation.json`,'utf8'));
await mkdir(destination,{recursive:true});
const results=[];
for(const {key,source} of manifest.avatars){
  const original=`${root}/${key}.png`;
  try{await access(original);}catch{await copyFile(source,original);}
  if(!(await sharp(original).metadata()).hasAlpha)throw new Error(`Missing alpha: ${key}`);
  const sizes=[];
  for(const size of [96,192]){
    const result=await sharp(original).trim({threshold:12}).resize(size,size,{fit:'contain',background:'#00000000'}).webp({quality:86,alphaQuality:100,effort:5}).toFile(`${destination}/person-${key}${size===192?'@2x':''}.webp`);
    sizes.push({size,bytes:result.size});
  }
  results.push({key,sizes});
}
await writeFile(`${root}/asset-sizes.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
