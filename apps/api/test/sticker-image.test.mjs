import assert from 'node:assert/strict';
import {test} from 'node:test';
import sharp from 'sharp';
import {generateStickerSheet,splitStickerSheet,stickerKeys} from '../dist/sticker-image.js';
import {AvatarProviderError} from '../dist/avatar-image.js';
export async function syntheticSheet(){
  const colors=['#3050a0','#90b040','#30a070','#b05020','#406080','#50a0b0'];
  const layers=await Promise.all(colors.map(async(color,i)=>({input:await sharp({create:{width:42,height:58,channels:3,background:color}}).png().toBuffer(),left:(i%3)*100+29,top:Math.floor(i/3)*100+21})));
  return sharp({create:{width:300,height:200,channels:3,background:'#ff00ff'}}).composite(layers).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer();
}
test('a six-cell sheet becomes six transparent, square, optimized stickers',async()=>{
  const result=await splitStickerSheet(await syntheticSheet());assert.equal(result.length,6);assert.equal(stickerKeys[3],'thumbs-up');
  for(const bytes of result){const meta=await sharp(bytes).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);assert.equal(meta.hasAlpha,true);const stats=await sharp(bytes).stats();assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);}
});
test('bad grids and absent color keys are refused',async()=>{
  await assert.rejects(splitStickerSheet(Buffer.from('not an image')),error=>error instanceof AvatarProviderError&&!error.retryable);
  const blank=await sharp({create:{width:300,height:200,channels:3,background:'#ffffff'}}).jpeg().toBuffer();await assert.rejects(splitStickerSheet(blank));
  const allKey=await sharp({create:{width:300,height:200,channels:3,background:'#ff00ff'}}).jpeg().toBuffer();await assert.rejects(splitStickerSheet(allKey));
});
test('the provider receives only the saved avatar and opts out of interaction storage',async()=>{
  const sheet=await syntheticSheet();let body;
  const result=await generateStickerSheet(Buffer.from('avatar'),{apiKey:'fixture',model:'image',baseUrl:'https://provider.test'},async(url,init)=>{
    assert.equal(url,'https://provider.test/v1beta/interactions');body=JSON.parse(init.body);
    return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:sheet.toString('base64')}]}]});
  });
  assert.deepEqual(result,sheet);assert.equal(body.store,false);assert.equal(body.input.length,2);assert.equal(body.input[1].mime_type,'image/webp');assert.equal(body.response_format.aspect_ratio,'3:2');
});
