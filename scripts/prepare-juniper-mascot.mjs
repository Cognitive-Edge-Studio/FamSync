import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const source='output/mascots/juniper/source.png';
const web='apps/web/public/mascots',mobile='apps/mobile/assets/mascots';
await Promise.all([mkdir(web,{recursive:true}),mkdir(mobile,{recursive:true})]);
const report=[];
for(const [name,size,portrait] of [['juniper',256,false],['juniper@2x',512,false],['juniper-avatar',96,true],['juniper-avatar@2x',192,true]]) {
  let image=sharp(source);
  // Frame the face for small avatars; keep the supplied full character for the welcome screen.
  image=portrait?image.extract({left:80,top:45,width:600,height:470}):image.trim({threshold:8});
  const result=await image.resize(size,size,{fit:'contain',background:'#00000000'}).webp({quality:88,alphaQuality:100,effort:5}).toFile(`${web}/${name}.webp`);
  await copyFile(`${web}/${name}.webp`,`${mobile}/${name}.webp`);
  if(portrait) {
    const icon=`helper${size===192?'@2x':''}.webp`;
    await copyFile(`${web}/${name}.webp`,`apps/web/public/icons/3d/${icon}`);
    await copyFile(`${web}/${name}.webp`,`apps/mobile/assets/icons/3d/${icon}`);
  }
  report.push({name,size,bytes:result.size});
}
await writeFile('output/mascots/juniper/asset-sizes.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
