'use client';
import { useEffect, useRef, useState } from 'react';
export default function GlobalFileSearch() {
  const [q,setQ] = useState(''), [rows,setRows] = useState<any[]>([]), [error,setError] = useState('');
  const [busy,setBusy] = useState(false), [open,setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key);
  },[]);
  useEffect(() => {
    const controller = new AbortController(); setRows([]); setError('');
    if (q.trim().length < 2) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/files/search?q=${encodeURIComponent(q)}`,{ cache:'no-store',signal:controller.signal });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Search unavailable.');
        if (!controller.signal.aborted) setRows(d.results);
      } catch(e:any) { if (!controller.signal.aborted) setError(e.message || 'Search unavailable.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    },250);
    return () => { clearTimeout(timer); controller.abort(); };
  },[q]);
  return <div style={{position:'relative',minWidth:220,flex:1,maxWidth:560}}>
    <input ref={input} aria-label="Search all authorized files" type="search" placeholder="Search all files · name, phone, file number" value={q}
      style={{width:'100%',minHeight:44,fontSize:16}} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}} />
    {open && q.trim().length >= 2 && <div aria-label="File search results" style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:'white',color:'#16324f',boxShadow:'0 4px 20px #0003',padding:12,maxHeight:'60vh',overflow:'auto'}}>
      <button type="button" onClick={()=>setOpen(false)} style={{float:'right'}}>Close</button>
      {busy ? <p role="status">Searching…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>No authorized files match.</p> : rows.map(r=><a key={r.id} href={r.href} style={{display:'block',padding:10,color:'inherit'}}><strong>{r.claimant_name || 'Name not recorded'}</strong><br/>{r.lead_no} · {r.phone} · {r.campaign}</a>)}
      {rows.length === 30 && <p>Showing 30 matches. Narrow the search for more specific results.</p>}
    </div>}
  </div>;
}
