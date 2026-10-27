/** Notifications contain only claim IDs; every recipient refetches under its own authorization. */
export const CURRENT_STATUS_EVENT = 'cr:current-status';
export function publishCurrentStatus(claimId:string) {
  window.dispatchEvent(new CustomEvent(CURRENT_STATUS_EVENT,{detail:{claimId}}));
  try { const c=new BroadcastChannel(CURRENT_STATUS_EVENT);c.postMessage({claimId});c.close(); } catch {}
}
export function subscribeCurrentStatus(claimId:string,refresh:()=>void) {
  const event=(e:Event)=>{if((e as CustomEvent).detail?.claimId===claimId)refresh();};
  window.addEventListener(CURRENT_STATUS_EVENT,event);
  let channel:BroadcastChannel|undefined;
  try { channel=new BroadcastChannel(CURRENT_STATUS_EVENT); channel.onmessage=e=>{if(e.data?.claimId===claimId)refresh();}; }catch{}
  window.addEventListener('focus',refresh);
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')refresh();},15000);
  return ()=>{window.removeEventListener(CURRENT_STATUS_EVENT,event);window.removeEventListener('focus',refresh);window.clearInterval(interval);channel?.close();};
}
export const EDIT_CURRENT_STATUS_EVENT = 'cr:edit-current-status';
export function editCurrentStatus(claimId:string,status?:string) {
  window.dispatchEvent(new CustomEvent(EDIT_CURRENT_STATUS_EVENT,{detail:{claimId,status}}));
  document.querySelector(`[data-claim-id="${claimId}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
