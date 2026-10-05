export const runtime = 'edge';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { redirect } from 'next/navigation';
import { mayOpenFullFile } from '@/lib/file-fence';

export default async function OtherWork() {
  const me = await gateUser(await supabaseServer());
  if (!me) redirect('/login');
  return <section style={{ maxWidth: 960, margin: '24px auto' }}>
    <p className="cl-lede">Separate workspace</p><h1 className="cl-h1">Other work</h1>
    <p>Motel 6 and other non-MVA files live here. Your existing access stays the same.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '24px 0' }}>
      <Link className="cl-panel" style={{ display: 'block', padding: 24, minWidth: 240 }} href="/m6"><h2>Motel 6</h2><p>Cases, follow-ups and documents →</p></Link>
      {mayOpenFullFile(me.role) && <Link className="cl-panel" style={{ display: 'block', padding: 24, minWidth: 240 }} href="/leads?area=other"><h2>Other case types</h2><p>Open files and signed files →</p></Link>}
    </div>
    {me.role === 'owner' && <p><Link href="/dashboard?area=other">Dashboard</Link> · <Link href="/reports?area=other">Reports</Link> · <Link href="/leads/archive?area=other">Test files & archive</Link></p>}
    <Link className="cl-btn" href="/dashboard">Back to MVA</Link>
  </section>;
}
