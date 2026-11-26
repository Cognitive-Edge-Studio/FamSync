import { cn } from '@/lib/utils';

/** The default helper look uses Juniper's mascot. Other chosen emoji looks still render normally. */
export function HelperAvatar({emoji='🌿',className,full=false}:{emoji?:string;className?:string;full?:boolean}) {
  const mascot=emoji==='🌿',asset=full?'juniper':'juniper-avatar';
  return <span aria-hidden="true" className={cn('inline-grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-sage text-2xl ring-1 ring-border/50',full&&mascot&&'rounded-none bg-transparent ring-0',className)}>
    {mascot?<img src={`/mascots/${asset}.webp`} srcSet={`/mascots/${asset}@2x.webp 2x`} alt="" width={full?256:96} height={full?256:96} draggable={false} className="size-full object-contain"/>:emoji}
  </span>;
}
