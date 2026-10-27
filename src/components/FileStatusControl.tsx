'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENT_STATUSES, STATUS_REASONS, currentStatusLabel, validateStatusEdit } from '@/lib/current-status';
import { publishCurrentStatus, subscribeCurrentStatus, EDIT_CURRENT_STATUS_EVENT } from '@/lib/current-status-events';
async function readStatusResponse(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error
    : response.status === 403 ? 'You do not have permission to access or change this status.'
    : response.status === 401 ? 'Your session expired. Sign in again.'
    : fallback);
  if (!data?.current || typeof data.current.updated_at !== 'string' || typeof data.current.key !== 'string') throw new Error(fallback);
  return data;
}
export default function FileStatusControl({leadId,claimId,current,role,onChanged}: {
  leadId:string;claimId?:string|null;current:string;currentLabel?:string;role?:string;signedDeclineAvailable?:boolean;onChanged?:(status:string)=>void;
}) {
  const router=useRouter();
  const [saved,setSaved]=useState<any>(null),[edit,setEdit]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef(0),changed=useRef(onChanged), editing=useRef(false), latest=useRef('');
  changed.current=onChanged; editing.current=!!edit;
  useEffect(()=>{
    setSaved(null);setEdit(null);setError('');latest.current='';
    if(!claimId || role==='firm')return;
    let active=true;
    const load=async()=>{
      const seq=++request.current;
      try {
        const r=await fetch(`/api/current-status?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`,{cache:'no-store'});
        const d=await readStatusResponse(r,'Could not load current status. Refresh and try again.');
        if(active && seq===request.current){
          const prior=latest.current;latest.current=d.current.updated_at;setSaved(d.current);
          if(!editing.current)setError('');
          if(prior && prior!==d.current.updated_at){changed.current?.(d.current.key);router.refresh();}
        }
      }catch(e:any){if(active && seq===request.current)setError(e.message);}
    };
    void load();const stop=subscribeCurrentStatus(claimId,()=>void load());
    return()=>{active=false;request.current++;stop();};
  },[leadId,claimId,role,router]);
  useEffect(()=>{
    const open=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.claimId!==claimId || !saved?.can_edit)return;
      if(d.status && !CURRENT_STATUSES.some(([k])=>k===d.status)){setError('This legacy outcome needs a reviewed mapping. Choose Current Status above.');return;}
      setEdit({status:d.status || saved.key,category:null,descriptor:null,note:'',callback_at:null,expected_updated_at:saved.updated_at});};
    window.addEventListener(EDIT_CURRENT_STATUS_EVENT,open);return()=>window.removeEventListener(EDIT_CURRENT_STATUS_EVENT,open);
  },[claimId,saved]);
  async function save(){
    const parsed=validateStatusEdit(edit);if(parsed.error){setError(parsed.error);return;}
    setBusy(true);setError('');const identity=claimId;const seq=++request.current;
    try {
      const r=await fetch('/api/current-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...parsed.value,lead_id:leadId,claim_id:identity,expected_updated_at:edit.expected_updated_at})});
      const d=await readStatusResponse(r,'Status save could not be confirmed. Refresh before retrying.');
      if(seq===request.current){setSaved(d.current);latest.current=d.current.updated_at;setEdit(null);changed.current?.(d.current.key);router.refresh();}
      if(identity)publishCurrentStatus(identity);
    }catch(e:any){if(seq===request.current)setError(e.message || 'Status save could not be confirmed. Refresh before retrying.');}
    finally{setBusy(false);}
  }
  const key=saved?.key || current;
  const groups=STATUS_REASONS.filter(r=>(r.statuses as readonly string[]).includes(edit?.status));
  const descriptors=groups.find(r=>r.category===edit?.category)?.descriptors || [];
  return <div className="file-status-control" data-claim-id={claimId}>
    <label className="current-status-picker">Current Status
      <select aria-label="Current Status" value={edit?.status || key} disabled={busy || !saved?.can_edit || role==='firm'} onChange={e=>{setError('');setEdit({status:e.target.value,category:null,descriptor:null,note:'',callback_at:null,expected_updated_at:saved.updated_at});}}>
        {!CURRENT_STATUSES.some(([k])=>k===key)&&<option value={key}>{currentStatusLabel(key)} · legacy mapping needed</option>}
        {CURRENT_STATUSES.map(([k,label])=><option key={k} value={k}>{label}</option>)}
      </select>
    </label>
    {saved && !edit && <button type="button" disabled={!saved.can_edit} onClick={()=>setEdit({status:key,category:saved.category,descriptor:saved.descriptor,note:'',callback_at:saved.callback_at,expected_updated_at:saved.updated_at})}>Add status note</button>}
    {saved?.note && !edit && <small>{saved.note}</small>}
    {edit && <div className="current-status-fields">
      {!!groups.length && <><label>Reason category<select aria-label="Reason category" value={edit.category || ''} onChange={e=>setEdit({...edit,category:e.target.value,descriptor:null})}><option value="">Choose category</option>{groups.map(r=><option key={r.category} value={r.category}>{r.label}</option>)}</select></label>
      <label>Specific descriptor<select aria-label="Specific descriptor" value={edit.descriptor || ''} onChange={e=>setEdit({...edit,descriptor:e.target.value})}><option value="">Choose descriptor</option>{descriptors.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label></>}
      {edit.status==='scheduled_callback'&&<label>Call back at<input aria-label="Call back at" type="datetime-local" onChange={e=>setEdit({...edit,callback_at:e.target.value})}/></label>}
      <label>Agent note · one sentence required<input aria-label="Agent note" required maxLength={500} value={edit.note} onChange={e=>setEdit({...edit,note:e.target.value})}/></label>
      {saved?.updated_at!==edit.expected_updated_at&&<p role="alert">This claim changed. Cancel and review the latest status before saving.</p>}
      <button type="button" disabled={busy||saved?.updated_at!==edit.expected_updated_at} onClick={()=>void save()}>{busy?'Saving…':'Save status'}</button>
      <button type="button" disabled={busy} onClick={()=>{setEdit(null);setError('');}}>Cancel</button>
    </div>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
