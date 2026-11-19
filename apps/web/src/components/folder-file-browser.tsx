"use client";

import type {components} from '@famsync/api-client';
import type {Session} from '@supabase/auth-js';
import {useEffect, useRef, useState} from 'react';
import {Archive, FileImage, FileText, File as FileIcon, Loader2, Sheet, Eye, RotateCcw} from 'lucide-react';
import {getBrowserApi} from '@/lib/browser-auth';
import {fileSize, type StoredFile} from '@/lib/files';
import {familyError} from './family-session';
import {FileActions} from './file-controls';
import {Button} from './ui/button';
import {FormFeedback} from './account-fields';

type PreviewData = components['schemas']['FilePreviewDto'];

function useFilePreview(familyId:string, accessToken:string, file:StoredFile) {
  const [data,setData]=useState<PreviewData>();
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!file.canDownload || file.preview==='none')return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')setRevision(v=>v+1);},15000);
    return()=>clearInterval(timer);
  },[file.canDownload,file.preview]);
  useEffect(()=>{
    setError('');
    if(!file.canDownload || file.preview==='none')return;
    const controller=new AbortController();
    void getBrowserApi(accessToken).POST('/api/v1/families/{familyId}/files/{fileId}/preview',{
      params:{path:{familyId,fileId:file.id}},signal:controller.signal,
    }).then(result=>{
      if(controller.signal.aborted)return;
      if(!result.data)throw Error(familyError(result.error,'Preview unavailable.'));
      setData(result.data);
    }).catch(reason=>{if(!controller.signal.aborted){setData(undefined);setError(reason instanceof Error?reason.message:'Preview unavailable.');}});
    return()=>controller.abort();
  },[familyId,accessToken,file.id,file.version,file.canDownload,file.preview,revision]);
  return {data,error,retry:()=>setRevision(v=>v+1),imageError:()=>{setData(undefined);setError('The image preview is unavailable. Try again.');}};
}

function fileAppearance(file:StoredFile) {
  if(file.preview==='image')return {Icon:FileImage,label:'Image',tone:'bg-peach text-peach-foreground'};
  if(file.mime==='text/csv')return {Icon:Sheet,label:'Spreadsheet',tone:'bg-accent text-accent-foreground'};
  if(file.mime==='application/pdf')return {Icon:FileText,label:'PDF document',tone:'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'};
  if(file.preview==='text')return {Icon:FileText,label:'Text document',tone:'bg-lavender text-lavender-foreground'};
  return {Icon:FileIcon,label:'File',tone:'bg-muted text-muted-foreground'};
}

// Bounded CSV display, including quoted commas, escaped quotes and multiline cells.
function csvRows(text:string) {
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length&&rows.length<21;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(char===','&&!quoted){if(row.length<12)row.push(cell);cell='';}
    else if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&text[i+1]==='\n')i++;
      if(row.length<12)row.push(cell);rows.push(row);row=[];cell='';
    }else cell+=char;
  }
  if(rows.length<21&&(cell||row.length)){if(row.length<12)row.push(cell);rows.push(row);}
  return rows;
}

function FileSurface({familyId,session,file,thumbnail=false}:{familyId:string;session:Session;file:StoredFile;thumbnail?:boolean}) {
  const {data,error,retry,imageError}=useFilePreview(familyId,session.access_token,file);
  const {Icon,label,tone}=fileAppearance(file);
  if(!file.canDownload||file.preview==='none'||error)return <div className={'flex flex-col items-center justify-center gap-3 p-6 text-center '+(thumbnail?'h-36':'min-h-80')}>
    <span className={'grid size-14 place-items-center rounded-2xl '+tone}><Icon aria-hidden="true" className="size-7"/></span>
    {!thumbnail&&<><p className="text-sm text-muted-foreground">{error||(!file.canDownload?'This file is unavailable while archived.':label+' · Download to view this file.')}</p>{error&&<Button size="sm" variant="outline" onClick={retry}>Retry preview</Button>}</>}
  </div>;
  if(!data)return <div role={thumbnail?undefined:'status'} className={'flex items-center justify-center gap-2 text-sm text-muted-foreground '+(thumbnail?'h-36':'min-h-80')}><Loader2 aria-hidden="true" className="size-4 animate-spin"/>{!thumbnail&&'Loading preview…'}</div>;
  if(data.kind==='image'&&data.url)return <div className={thumbnail?'flex h-36 items-center justify-center overflow-hidden bg-muted/40':'flex min-h-80 items-center justify-center bg-muted/40 p-4'}><img src={data.url} alt={thumbnail?'':file.fileName} loading="lazy" className={thumbnail?'h-full w-full object-cover':'max-h-[60dvh] max-w-full rounded-lg object-contain'} onError={imageError}/></div>;
  if(file.mime==='text/csv'){
    const rows=csvRows(data.text??'');
    return <div className={thumbnail?'pointer-events-none h-36 overflow-hidden p-4':'min-h-80 overflow-auto p-5'}><table className={'w-full border-collapse text-left '+(thumbnail?'text-[9px]':'text-sm')}><tbody>{rows.slice(0,thumbnail?5:21).map((row,index)=><tr key={index}>{row.slice(0,thumbnail?4:12).map((cell,n)=>index===0?<th key={n} className="max-w-56 border border-border bg-accent/60 px-3 py-2 font-medium wrap-anywhere">{cell}</th>:<td key={n} className="max-w-56 border border-border bg-panel px-3 py-2 align-top wrap-anywhere">{cell}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="text-sm text-muted-foreground">This file is empty.</p>}{!thumbnail&&<p className="mt-4 text-xs text-muted-foreground">Preview of up to 20 rows and 12 columns. Download for the full spreadsheet.</p>}</div>;
  }
  return <div className={thumbnail?'h-36 overflow-hidden p-4':'min-h-80 p-5'}><pre className={'whitespace-pre-wrap wrap-anywhere font-mono '+(thumbnail?'text-[10px] leading-5 text-muted-foreground':'text-sm leading-7')}>{data.text||'This file is empty.'}</pre>{!thumbnail&&<p className="mt-6 text-xs text-muted-foreground">Showing up to 50,000 characters. Download for the full file.</p>}</div>;
}

function ArchiveFile({familyId,session,file,onChanged}:{familyId:string;session:Session;file:StoredFile;onChanged:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function archive(){setBusy(true);setError('');try{
    const result=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/files/{fileId}/archive',{params:{path:{familyId,fileId:file.id}},body:{version:file.version,archived:!file.archived}});
    if(!result.data)throw Error(familyError(result.error,'We couldn’t update this file.'));
    onChanged();
  }catch(reason){setError(reason instanceof Error?reason.message:'We couldn’t update this file.');}finally{setBusy(false);}}
  return <><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void archive()}>{file.archived?<RotateCcw aria-hidden="true"/>:<Archive aria-hidden="true"/>}{file.archived?'Restore file':'Archive file'}</Button><FormFeedback error={error}/></>;
}

export function FolderFileBrowser({familyId,session,files,onChanged}:{familyId:string;session:Session;files:StoredFile[];onChanged:()=>void}) {
  const [selectedId,setSelectedId]=useState<string>();
  const selected=files.find(file=>file.id===selectedId)??files[0];
  const preview=useRef<HTMLElement>(null);
  if(!selected)return null;
  return <div className="mt-5 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <ul aria-label="Folder files" className="grid min-w-0 gap-4 sm:grid-cols-2">{files.map(file=>{
      const {Icon,label,tone}=fileAppearance(file);
      return <li key={file.id} className="min-w-0"><button type="button" aria-label={'Select '+file.fileName} aria-pressed={selected.id===file.id} onClick={()=>{
        setSelectedId(file.id);
        if(window.innerWidth<1280)requestAnimationFrame(()=>{preview.current?.focus({preventScroll:true});preview.current?.scrollIntoView({block:'nearest',behavior:'smooth'});});
      }} className={'group w-full overflow-hidden rounded-xl border bg-panel text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 '+(selected.id===file.id?'border-primary ring-1 ring-primary/30':'border-border')}>
        <div aria-hidden="true" className="relative border-b border-border bg-muted/40"><FileSurface familyId={familyId} session={session} file={file} thumbnail/><span className="absolute right-2 bottom-2 rounded-md border border-border bg-panel/95 p-1.5 text-muted-foreground"><Eye className="size-3.5"/></span></div>
        <div className="flex items-center gap-3 p-3.5"><span className={'grid size-9 shrink-0 place-items-center rounded-lg '+tone}><Icon aria-hidden="true" className="size-4"/></span><div className="min-w-0"><h3 className="truncate text-sm font-medium" title={file.fileName}>{file.fileName}</h3><p className="mt-1 text-xs text-muted-foreground">{label} · {fileSize(file.byteSize)}{file.archived?' · Archived':''}</p></div></div>
      </button></li>;
    })}</ul>
    <section ref={preview} tabIndex={-1} aria-label="Selected file preview" className="min-w-0 overflow-hidden rounded-xl border border-border bg-panel outline-none xl:sticky xl:top-5">
      <div className="border-b border-border px-5 py-4"><p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">File preview</p><h2 className="wrap-anywhere text-lg font-semibold">{selected.fileName}</h2><p className="mt-1 text-xs text-muted-foreground">{fileAppearance(selected).label} · {fileSize(selected.byteSize)} · Added {new Date(selected.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</p></div>
      <div key={selected.id} className="max-h-[65dvh] overflow-auto"><FileSurface familyId={familyId} session={session} file={selected}/></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><FileActions key={selected.id} familyId={familyId} accessToken={session.access_token} file={selected}/>{selected.canManage&&<ArchiveFile key={'archive-'+selected.id} familyId={familyId} session={session} file={selected} onChanged={onChanged}/>}</div>
    </section>
  </div>;
}
