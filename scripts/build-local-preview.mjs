import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const env={...process.env,...parseEnv(readFileSync(new URL('../apps/web/.env.example',import.meta.url),'utf8')),
  NEXT_PUBLIC_API_BASE_URL:'http://127.0.0.1:4016',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',
  FAMSYNC_LOCAL_PREVIEW:'1'};
const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build','apps/web','--webpack'],{cwd:root,env,stdio:'inherit',windowsHide:true});
build.on('error',error=>{console.error('Could not build the local preview:',error.message);process.exitCode=1;});
build.on('exit',code=>{process.exitCode=code??1;});
