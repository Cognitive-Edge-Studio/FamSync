import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const web=resolve(root,'apps/web/out-local');
if(!existsSync(resolve(web,'index.html')))throw Error('Build the local preview first: npm run build:preview');
const ports=[3013,3021,3022,3033];
let api;
const running=await fetch('http://127.0.0.1:4016/health',{signal:AbortSignal.timeout(2000)}).then(async response=>response.ok&&(await response.json()).status==='ok').catch(()=>false);
if(!running)api=spawn(process.execPath,['--env-file=apps/api/.env.example','apps/api/dist/main.js'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,RESEND_API_KEY:'',PORT:'4016',WEB_ORIGINS:ports.map(port=>'http://127.0.0.1:'+port).join(','),INNGEST_SERVE_ORIGIN:'http://host.docker.internal:4016',INVITATION_WEB_ORIGIN:'http://127.0.0.1:3022'}});
const app=express();
app.get('/__checks/files-mobile',(_req,response)=>response.sendFile(resolve(root,'output/playwright/s16-mobile-preview.html')));
app.use(express.static(web));
const servers=ports.map(port=>app.listen(port,'127.0.0.1'));
console.log('Local preview on '+ports.join(', ')+' uses API 4016 and apps/web/out-local.');
function stop(){api?.kill();servers.forEach(server=>server.close());}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
