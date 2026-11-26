export type AvatarUrl = {userId:string;url:string;expiresAt:string};
export const isPersonId = (id:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** One in-memory cache per signed-in viewer. Batches mounted avatars; never persists signed URLs. */
export function createAvatarCache(resolve:(ids:string[])=>Promise<AvatarUrl[]>) {
  const values=new Map<string,{url:string|null;until:number}>(), listeners=new Map<string,Set<()=>void>>(), pending=new Set<string>();
  const inFlight=new Set<string>(),revisions=new Map<string,number>();
  let timer:ReturnType<typeof setTimeout>|undefined, epoch=0;
  const emit=(id:string)=>listeners.get(id)?.forEach(listener=>listener());
  const refresh=(id:string)=>{
    if(!isPersonId(id) || inFlight.has(id) || (values.get(id)?.until??0)>Date.now()) return;
    pending.add(id);
    timer??=setTimeout(()=>void flush(),20);
  };
  async function flush() {
    timer=undefined;
    const ids=[...pending].slice(0,100); ids.forEach(id=>{pending.delete(id);inFlight.add(id);});
    const versions=new Map(ids.map(id=>[id,revisions.get(id)??0]));
    const generation=epoch;
    try {
      const rows=await resolve(ids);
      if(generation!==epoch) return;
      for(const id of ids) {
        if(versions.get(id)!==(revisions.get(id)??0))continue;
        const row=rows.find(row=>row.userId===id);
        values.set(id,{url:row?.url??null,until:row?Math.min(Date.now()+45_000,Date.parse(row.expiresAt)-5000):Date.now()+30_000});
        emit(id);
      }
    } catch {
      if(generation!==epoch) return;
      for(const id of ids) { if(versions.get(id)!==(revisions.get(id)??0))continue;values.set(id,{url:null,until:Date.now()+10_000}); emit(id); }
    } finally {
      if(generation===epoch)for(const id of ids){inFlight.delete(id);if(versions.get(id)!==(revisions.get(id)??0))refresh(id);}
    }
    if(pending.size) timer??=setTimeout(()=>void flush(),20);
  }
  return {
    get:(id:string)=>{const value=values.get(id);return value&&value.until>Date.now()?value.url:null;},
    subscribe(id:string,listener:()=>void) {
      const group=listeners.get(id)??new Set();group.add(listener);listeners.set(id,group);
      refresh(id);
      return ()=>{group.delete(listener);if(!group.size)listeners.delete(id);};
    },
    refresh,
    invalidate(id:string) { revisions.set(id,(revisions.get(id)??0)+1);values.delete(id);emit(id);refresh(id); },
    clear() { epoch++;values.clear();pending.clear();inFlight.clear();revisions.clear();if(timer)clearTimeout(timer);timer=undefined;listeners.forEach((_group,id)=>emit(id)); },
  };
}
