import { cn } from '@/lib/utils';

export type ModuleIconName = 'today' | 'calendar' | 'tasks' | 'goals' | 'channels' | 'messages' | 'families' | 'folders' | 'guests' | 'account' | 'notifications' | 'home' | 'schedule' | 'overdue' | 'helper';

/** Decorative artwork: the surrounding link, heading or button supplies the accessible name. */
export function ModuleIcon({ name, className }: { name: ModuleIconName; className?: string }) {
  return <img aria-hidden="true" alt="" draggable={false} width={96} height={96}
    src={`/icons/3d/${name}.webp`} srcSet={`/icons/3d/${name}@2x.webp 2x`}
    className={cn('inline-block size-7 shrink-0 object-contain select-none', className)} />;
}
