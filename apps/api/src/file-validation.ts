import {createHash} from 'node:crypto';
import {BadRequestException,PayloadTooLargeException} from '@nestjs/common';
import sharp from 'sharp';
sharp.concurrency(1);
export type IncomingFile={buffer:Buffer;size:number;originalname:string};
export async function validateStoredFile(file:IncomingFile,image=false){
 const limit=(image?2:5)*1024*1024;if(file.size>limit||file.buffer.length>limit)throw new PayloadTooLargeException('Choose a file up to '+(image?2:5)+' MB.');
 if(!file.size||file.size!==file.buffer.length)throw new BadRequestException('Choose a nonempty file.');
 const decoded=Buffer.from(file.originalname,'latin1').toString('utf8'),raw=decoded.includes('\ufffd')?file.originalname:decoded;
 const fileName=Array.from(raw.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,180).join('');
 if(!fileName)throw new BadRequestException('Choose a file with a name.');
 const ext=fileName.split('.').at(-1)!.toLowerCase(),types:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',m4a:'audio/mp4',weba:'audio/webm',mp4:'video/mp4',webm:'video/webm'};
 let mime=types[ext],buffer=file.buffer;
 if(!mime||image&&!mime.startsWith('image/'))throw new BadRequestException(image?'Choose a JPEG, PNG or WebP image.':'Choose PDF, JPEG, PNG, WebP, MP4, WebM, M4A, TXT or CSV.');
 if(mime.startsWith('image/')){
  try{const input=sharp(buffer,{limitInputPixels:16777216,failOn:'warning'}),meta=await input.metadata();
   if(meta.format!==({jpg:'jpeg',jpeg:'jpeg',png:'png',webp:'webp'} as Record<string,string>)[ext]||(meta.pages??1)>1)throw Error();
   if(image){buffer=await input.rotate().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();mime='image/webp';}
   else await input.resize(1,1).raw().toBuffer();
  }catch{throw new BadRequestException('Choose a valid still image up to 16 megapixels.');}
 }else if(mime==='application/pdf'){
  if(buffer.subarray(0,5).toString()!=='%PDF-')throw new BadRequestException('The PDF content does not match its file type.');
 }else if(mime.endsWith('/mp4')){
  if(buffer.toString('latin1',4,8)!=='ftyp')throw new BadRequestException('The recording or video content does not match its file type.');
 }else if(mime.endsWith('/webm')){
  if(buffer.toString('hex',0,4)!=='1a45dfa3'||!buffer.subarray(0,256).includes('webm'))throw new BadRequestException('The recording or video content does not match its file type.');
 }else{
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error();}catch{throw new BadRequestException('Choose a UTF-8 text or CSV file.');}
 }
 return{buffer,mime,fileName:image?'channel-image.webp':fileName,byteSize:buffer.length,hash:createHash('sha256').update(buffer).digest('hex')};
}
