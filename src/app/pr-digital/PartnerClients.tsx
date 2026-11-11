'use client';
import { Fragment, useState } from 'react';
import type { PartnerReportRow } from '@/lib/partner-report';
import { reportDate, reportDuration } from '@/lib/partner-report-view';

export default function PartnerClients({ rows }: { rows:PartnerReportRow[] }) {
  const [open,setOpen] = useState<PartnerReportRow | null>(null);
  // Resolve against the refreshed/filtered data rather than retaining stale detail content.
  const selected = open && rows.find(r=>r.name===open.name && r.phone===open.phone);
  return <div className="pr-table-wrap pr-clients"><table><caption className="pr-sr">PR Digital leads and call history</caption>
    <thead><tr><th>Client</th><th>Status</th><th>Outbound attempts</th><th>Response time</th><th>Latest outbound call</th><th>History</th></tr></thead>
    <tbody>{rows.map((row,index)=>{
      const expanded = selected === row;
      const id = `contact-history-${index}`;
      return <Fragment key={`${row.name}-${row.phone}-${index}`}><tr>
        <td data-label="Client" className="pr-name">{row.name}<small>{row.phone || 'Phone not recorded'}</small><small>Received {reportDate(row.receivedAt)}</small></td>
        <td data-label="Status" className="pr-status"><span>{row.status}</span></td>
        <td data-label="Outbound attempts"><strong className="pr-attempt-number">{row.attemptCount}</strong><small>{row.inboundCount} inbound · {row.manualLogCount} manual logs</small></td>
        <td data-label="Response time">{row.speedMinutes == null ? <span className="pr-missing">Unavailable</span> : reportDuration(row.speedMinutes*60)}<small>{row.responseTimeReason || 'Receipt to first outbound call'}</small></td>
        <td data-label="Latest outbound call">{reportDate(row.lastOutboundAt)}</td>
        <td data-label="History"><button className="pr-secondary" aria-expanded={expanded} aria-controls={id} onClick={()=>setOpen(expanded?null:row)}>{expanded?'Close history':'View history'}</button></td>
      </tr>{expanded && <tr className="pr-detail-row"><td colSpan={6}><section id={id} className="pr-history" aria-label={`History for ${row.name}`}>
        <div className="pr-history-heading"><div><div className="pr-kicker">CONTACT HISTORY</div><h2>{row.name}</h2><p>Recorded calls and file milestones · Pacific time</p></div><span className="pr-history-count">{row.callHistory.length} call records</span></div>
        <div className="pr-milestones"><div><span>First outbound call</span><strong>{reportDate(row.firstOutboundAt)}</strong></div><div><span>Signed</span><strong>{row.signed==='Yes'?reportDate(row.signedAt):row.signed==='Check signature'?'Needs verification':'Not signed'}</strong></div><div><span>Latest file activity</span><strong>{reportDate(row.lastActivityAt)}</strong></div></div>
        {row.notes && <div className="pr-agent-note"><strong>Latest file / call note</strong><p>{row.notes}</p></div>}
        <p className="pr-history-note">Outbound attempts count linked provider records. Manual logs are shown separately because they may describe the same call. “Answered” is the provider result, not proof of a completed intake. Duration may include ringing.</p>
        {row.callHistory.length ? <ol className="pr-timeline">{row.callHistory.map((call,i)=><li key={i}>
          <div className="pr-event-dot" aria-hidden="true"/><div className="pr-event-main"><strong>{call.direction === 'Unknown'?'Call':`${call.direction} call`}</strong><span className="pr-result-pill">{call.result}</span><small>{call.source}{call.source==='Manual log'?' · time logged, not verified call start':''}</small></div>
          <div className="pr-event-time"><time>{reportDate(call.at)}</time><small>{reportDuration(call.durationSeconds)}</small></div>
        </li>)}</ol> : <p className="pr-empty">No linked call records available. This does not establish that no calls were made.</p>}
      </section></td></tr>}</Fragment>;
    })}</tbody></table>{!rows.length && <p className="pr-empty">No clients match these filters.</p>}</div>;
}
