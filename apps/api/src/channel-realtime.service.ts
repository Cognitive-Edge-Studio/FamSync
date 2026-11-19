import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
@Injectable()
export class ChannelRealtimeService {
  async publish(client:PoolClient,channelId:string) {
    const url=process.env.SUPABASE_REALTIME_URL?.replace(/\/$/,'');
    const key=process.env.SUPABASE_REALTIME_KEY;
    if(!url||!key) throw new Error('Channel updates are not configured');
    const {rows}=await client.query<{user_id:string}>('select user_id from app.channel_signal_recipients($1)',[channelId]);
    if(!rows.length) return;
    const headers:Record<string,string>={'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key};
    if(process.env.SUPABASE_REALTIME_HOST) headers.Host=process.env.SUPABASE_REALTIME_HOST;
    const body=JSON.stringify({messages:rows.map(row=>({topic:'famsync:channel:'+channelId+':'+row.user_id,event:'refresh',payload:{},private:true}))});
    // Node's Fetch API ignores Host overrides. The direct local service routes tenants by Host;
    // hosted Supabase uses its ordinary project URL and needs no override.
    const status=await new Promise<number>((resolve,reject)=>{
      const target=new URL(url+'/api/broadcast');
      const request=(target.protocol==='https:'?httpsRequest:httpRequest)(target,{
        method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(body)},signal:AbortSignal.timeout(5000),
      },response=>{response.resume();response.once('end',()=>resolve(response.statusCode??500));response.once('error',reject);});
      request.once('error',reject);request.end(body);
    });
    if(status<200||status>=300) throw new Error('Channel refresh delivery failed ('+status+')');
  }
}
