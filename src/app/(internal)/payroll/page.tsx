import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { loadPayroll,payrollOwner,payrollToken,payrollView } from '@/lib/payroll-server';
import { defaultPayrollEnd,payrollPeriod } from '@/lib/payroll';
import Payroll from '@/components/Payroll';
export const runtime='edge';
export const dynamic='force-dynamic';
export default async function PayrollPage({searchParams}:{searchParams:Promise<{end?:string}>}) {
  const db=await supabaseServer(); if(!await payrollOwner(db))redirect('/dashboard');
  const now=new Date().toISOString(), params=await searchParams;
  let end=params.end||defaultPayrollEnd(now);try{payrollPeriod(end);}catch{end=defaultPayrollEnd(now);}
  try {const data=await loadPayroll(db);return <Payroll initial={{...payrollView(data,end,now),token:await payrollToken(data,end)}}/>;}
  catch{return <section style={{padding:32}}><h1>Payroll & billing</h1><p role="alert">Payroll could not load completely. No totals have been finalized. Refresh or ask the owner to check payroll storage.</p><a href="/payroll">Try again</a></section>;}
}
