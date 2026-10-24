'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENT_STATUS_EVENT } from '@/lib/current-status-events';
/** Reports and lists also refresh after a header save, including another tab. */
export default function CurrentStatusRefresh(){
 const router=useRouter();
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')router.refresh();};
  window.addEventListener(CURRENT_STATUS_EVENT,refresh);window.addEventListener('focus',refresh);
  let channel:BroadcastChannel|undefined;
  try{channel=new BroadcastChannel(CURRENT_STATUS_EVENT);channel.onmessage=refresh;}catch{}
  const timer=window.setInterval(refresh,30000);
  return()=>{window.removeEventListener(CURRENT_STATUS_EVENT,refresh);window.removeEventListener('focus',refresh);window.clearInterval(timer);channel?.close();};
 },[router]);
 return null;
}
