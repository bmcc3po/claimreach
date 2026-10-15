'use client';
import { useState } from 'react';
import PartnerSheet from '@/app/pr-digital/PartnerSheet';

export default function OwnerPartnerReport({ enabled,children }: { enabled:boolean; children:React.ReactNode }) {
  const [preview,setPreview] = useState(false);
  if (!enabled) return <>{children}</>;
  return <>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,padding:'14px 18px',marginBottom:18,border:'1px solid #cbdcd2',borderRadius:10,background:'#eef5f0',color:'#214e39'}}>
      <div><strong>{preview ? 'Viewing as PR Digital' : 'Owner reports'}</strong>{preview && <div style={{fontSize:12,marginTop:3}}>Same read-only data and filters they see. Your owner session stays active.</div>}</div>
      <button type="button" role="switch" aria-checked={preview} aria-label="View as PR Digital" className="cl-btn" onClick={()=>setPreview(!preview)}>{preview ? '← Back to owner view' : 'View as PR Digital →'}</button>
    </div>
    <div hidden={preview}>{children}</div>
    {preview && <PartnerSheet ownerPreview />}
  </>;
}
