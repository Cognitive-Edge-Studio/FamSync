import assert from 'node:assert/strict';
import {test} from 'node:test';
import sharp from 'sharp';
import {avatarPhoto,generateAvatar,AvatarProviderError} from '../dist/avatar-image.js';
import {AvatarsController} from '../dist/avatars.controller.js';
const image=()=>sharp({create:{width:80,height:100,channels:3,background:'#b8cab7'}}).jpeg().withMetadata({orientation:6,exif:{IFD0:{Artist:'private'}}}).toBuffer();
const settings={apiKey:'test',model:'test-image',baseUrl:'https://image.example.test'};

test('selfies are decoded, oriented, resized and stripped of metadata',async()=>{
  const bytes=await image(),normalized=await avatarPhoto({buffer:bytes,size:bytes.length,originalname:'selfie.jpg'}),meta=await sharp(normalized).metadata();
  assert.equal(meta.width,100);assert.equal(meta.height,80);assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);
  await assert.rejects(avatarPhoto({buffer:Buffer.from('<svg/>'),size:6,originalname:'selfie.jpg'}));
  await assert.rejects(avatarPhoto({buffer:bytes,size:6*1024*1024,originalname:'selfie.jpg'}),error=>error.getStatus()===413);
});
test('image generation sends selfie and style separately, opts out of storage, and returns an optimized avatar',async()=>{
  const bytes=await image();let body;
  const send=async(url,init)=>{assert.equal(url,settings.baseUrl+'/v1beta/interactions');body=JSON.parse(init.body);return Response.json({status:'completed',steps:[{type:'thought',content:[{type:'image',data:'ignore'}]},{type:'model_output',content:[{type:'image',data:bytes.toString('base64')}]}]});};
  const result=await generateAvatar(bytes,Buffer.from('reference'),settings,send),meta=await sharp(result).metadata();
  assert.equal(body.store,false);assert.equal(body.input[1].data,bytes.toString('base64'));assert.equal(body.input[2].data,Buffer.from('reference').toString('base64'));
  assert.equal(body.response_format.aspect_ratio,'1:1');assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
});
test('blocked and malformed image outputs fail without accepting text or thought images',async()=>{
  for(const result of [{status:'failed'},{status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'No'}]}]},{status:'completed',steps:[{type:'thought',content:[{type:'image',data:'x'}]}]}]){
    await assert.rejects(generateAvatar(Buffer.from('photo'),Buffer.from('style'),settings,async()=>Response.json(result)),error=>error instanceof AvatarProviderError&&!error.retryable);
  }
});
test('only temporary provider failures may retry',async()=>{
  for(const status of [400,403,429,500]) await assert.rejects(generateAvatar(Buffer.from('photo'),Buffer.from('style'),settings,async()=>new Response('{}',{status})),error=>error instanceof AvatarProviderError&&error.retryable===(status===429||status>=500));
});
test('upload requires explicit photo-processing consent before calling the service',async()=>{
  let calls=0;const controller=new AvatarsController({upload:async()=>{calls++;return{id:'created'};}});
  const request={actorId:'a0000000-0000-4000-8000-000000000001'},body={id:'a0000000-0000-4000-8000-000000000002'},file={buffer:Buffer.from('x'),size:1,originalname:'x.jpg'};
  for(const consent of [undefined,false,'false'])assert.throws(()=>controller.upload(request,{...body,consent},file),error=>error.getStatus()===400);
  assert.equal(calls,0);await controller.upload(request,{...body,consent:'true'},file);assert.equal(calls,1);
});
