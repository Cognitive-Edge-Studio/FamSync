"use client";

import type {components} from '@famsync/api-client';
import {useEffect,useId,useState} from 'react';
import {ArrowUpRight,RefreshCw,Target} from 'lucide-react';
import {getBrowserApi} from '@/lib/browser-auth';
import {familyProgress} from '@/lib/family-progress';
import type {Goal} from '@/lib/goals';
import type {Task} from '@/lib/tasks';
import {cn} from '@/lib/utils';
import {inputClass,FormFeedback} from './account-fields';
import {Card,CardHeader,CardTitle,CardDescription} from './ui/card';
import {Button,ButtonLink} from './ui/button';

type Member=components['schemas']['FamilyMemberDto'];
type Progress=ReturnType<typeof familyProgress>;

function ProgressRadar({categories}:Pick<Progress,'categories'>) {
  const id=useId();
  const point=(index:number,radius:number)=>{
    const angle=index*Math.PI/4-Math.PI/2;
    return [210+Math.cos(angle)*radius,176+Math.sin(angle)*radius];
  };
  const polygon=(radius:number)=>categories.map((_,index)=>point(index,radius).join(',')).join(' ');
  const values=categories.map((axis,index)=>point(index,(axis.value??0)*1.04));
  return <svg viewBox="0 0 420 350" className="mx-auto w-full max-w-md overflow-visible" role="img" aria-labelledby={id+'-title '+id+'-description'}>
    <title id={id+'-title'}>Goal completion by category</title>
    <desc id={id+'-description'}>{categories.map(axis=>axis.label+': '+(axis.value===null?'no measured goals':axis.value+' percent')).join('. ')}. Untracked categories have no percentage.</desc>
    {[26,52,78,104].map(radius=><polygon key={radius} points={polygon(radius)} fill={radius===104?'var(--muted)':'none'} fillOpacity={radius===104?.35:1} stroke="var(--border)"/>)}
    {categories.map((axis,index)=>{
      const edge=point(index,104),label=point(index,143);
      return <g key={axis.category}><line x1={210} y1={176} x2={edge[0]} y2={edge[1]} stroke="var(--border)"/><text x={label[0]} y={label[1]} textAnchor={index===0||index===4?'middle':index<4?'start':'end'} dominantBaseline="middle" fill="var(--muted-foreground)" fontSize="12">{axis.label}</text></g>;
    })}
    <text x={215} y={75} fill="var(--muted-foreground)" fontSize="9">100%</text>
    <text x={215} y={127} fill="var(--muted-foreground)" fontSize="9">50%</text>
    {categories.some(axis=>axis.value!==null)&&<g className="text-lavender-foreground"><polygon points={values.map(value=>value.join(',')).join(' ')} fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>{categories.map((axis,index)=>axis.value!==null&&<circle key={axis.category} cx={values[index][0]} cy={values[index][1]} r="4" fill="currentColor" stroke="var(--panel)" strokeWidth="2"/>)}</g>}
  </svg>;
}

export function FamilyProgressCard({familyId,accessToken,today,timeZone,taskRevision}:{familyId:string;accessToken:string;today:string;timeZone:string;taskRevision:number}) {
  const [data,setData]=useState<{members:Member[];goals:Goal[];tasks:Task[]}>();
  const [memberId,setMemberId]=useState('all'),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const selectId=useId();
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setError('');setLoading(true);
    const api=getBrowserApi(accessToken);
    async function goals(){
      const items:Goal[]=[],seen=new Set<string>();let cursor:string|undefined;
      do {
        const result=await api.GET('/api/v1/families/{familyId}/goals',{params:{path:{familyId},query:{scope:'all',archived:'false',limit:100,cursor}},signal:controller.signal});
        if(!result.data)throw Error('Goals unavailable.');
        items.push(...result.data.goals);cursor=result.data.nextCursor??undefined;
        if(cursor&&seen.has(cursor))throw Error('Could not finish loading goals.');
        if(cursor)seen.add(cursor);
      }while(cursor);
      return items;
    }
    async function tasks(){
      const items:Task[]=[],seen=new Set<string>();let cursor:string|undefined;
      do {
        const result=await api.GET('/api/v1/families/{familyId}/tasks',{params:{path:{familyId},query:{scope:'all',archived:'false',limit:100,cursor}},signal:controller.signal});
        if(!result.data)throw Error('Tasks unavailable.');
        items.push(...result.data.tasks);cursor=result.data.nextCursor??undefined;
        if(cursor&&seen.has(cursor))throw Error('Could not finish loading tasks.');
        if(cursor)seen.add(cursor);
      }while(cursor);
      return items;
    }
    void Promise.all([api.GET('/api/v1/families/{familyId}/members',{params:{path:{familyId}},signal:controller.signal}),goals(),tasks()]).then(([members,goals,tasks])=>{
      if(controller.signal.aborted)return;
      if(!members.data)throw Error('Members unavailable.');
      setData({members:members.data,goals,tasks});
    }).catch(()=>{if(!controller.signal.aborted){setData(undefined);setError('We couldn’t load family progress.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[familyId,accessToken,revision,taskRevision]);
  const selectedId=memberId==='all'||data?.members.some(member=>member.userId===memberId)?memberId:'all';
  const progress=data?familyProgress(data.goals,data.tasks,selectedId,today,timeZone):undefined;
  return <Card className="@container min-w-0" aria-labelledby="family-progress-title">
    <CardHeader><div><CardTitle id="family-progress-title">Family progress</CardTitle><CardDescription>Goals, small wins and everyday responsibilities</CardDescription></div><Button variant="ghost" size="icon-sm" aria-label="Refresh family progress" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw aria-hidden="true" className={cn('size-3.5',loading&&'animate-spin')}/></Button></CardHeader>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><label className="sr-only" htmlFor={selectId}>Progress for family member</label><select id={selectId} className={cn(inputClass,'w-auto max-w-full')} value={selectedId} onChange={event=>setMemberId(event.target.value)}><option value="all">Whole family</option>{data?.members.map(member=><option key={member.userId} value={member.userId}>{[member.firstName,member.lastName].filter(Boolean).join(' ')||'Family member'}</option>)}</select></div><span className="text-xs text-muted-foreground">{progress?progress.goalCount+' visible goals':'Loading progress…'}</span></div>
    {error?<div className="my-8 flex flex-wrap items-center gap-3"><FormFeedback error={error}/><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Try again</Button></div>:!progress?<div role="status" className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading family progress…</div>:<>
      <div className="grid items-center gap-2 py-3 @[480px]:grid-cols-[minmax(0,1fr)_9rem]"><div className="min-w-0"><ProgressRadar categories={progress.categories}/></div><dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 @[480px]:grid-cols-1">{progress.categories.map(axis=><div key={axis.category} className="flex items-center justify-between gap-2 text-xs"><dt className="text-muted-foreground" title={axis.category}>{axis.label}</dt><dd className="font-medium tabular-nums">{axis.value===null?'—':axis.value+'%'}</dd></div>)}</dl></div>
      {!progress.goalCount&&<div className="mb-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground"><Target aria-hidden="true" className="size-4 shrink-0"/><p>{selectedId==='all'?'Create a goal to start tracking progress.':'No individual goals assigned to this member yet.'}</p></div>}
      <div className="grid grid-cols-3 divide-x divide-border border-y border-border py-4"><div className="pr-2"><p className="text-xl font-semibold tabular-nums">{progress.active}</p><p className="mt-1 text-xs text-muted-foreground">Open tasks</p></div><div className="px-3"><p className="text-xl font-semibold tabular-nums">{progress.completedThisWeek}</p><p className="mt-1 text-xs text-muted-foreground">Done in 7 days</p></div><div className="pl-3"><p className={cn('text-xl font-semibold tabular-nums',progress.overdue>0&&'text-destructive')}>{progress.overdue}</p><p className="mt-1 text-xs text-muted-foreground">Overdue tasks</p></div></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Percentages reflect goal completion. — means no measured goals. Choose a child or family member to see their assigned work.</p>
      <ButtonLink variant="link" href={'/family-base/?'+new URLSearchParams({family:familyId})} className="mt-1 h-8 px-0 text-xs">Open Family Base<ArrowUpRight aria-hidden="true"/></ButtonLink>
    </>}
  </Card>;
}
