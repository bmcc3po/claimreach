/** Intake attribution is saved on the file. Assignment, viewer and sender are not substitutes. */
export function intakeAgentName(lead: any, users: { id: string; full_name?: string | null }[]): string {
  return users.find(u => u.id === lead?.intake_agent_id)?.full_name?.trim() || 'Not recorded';
}

/** Read only names referenced by already-authorized files, through the caller's existing DB context. */
export async function loadIntakeAgents(db: any, leads: any[]): Promise<{ id: string; full_name?: string | null }[]> {
  const ids = [...new Set(leads.map(l => l?.intake_agent_id).filter(Boolean))];
  if (!ids.length) return [];
  const names: { id: string; full_name?: string | null }[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await db.from('app_users').select('id, full_name').in('id', ids.slice(start, start + 100));
    if (error) throw new Error('Could not load intake agent names. Please refresh.');
    names.push(...(data || []));
  }
  return names;
}

/** Assignment is not proof of who took the intake or sent the agreement. */
export function fileAgentSummary(lead: any, users: { id: string; full_name?: string | null }[], callAgent?: string | null, signingAgentId?: string | null): string {
  const name = (id: string | null) => users.find(u => u.id === id)?.full_name || '';
  const intake = name(lead.intake_agent_id) || callAgent || '';
  const assigned = name(lead.assigned_agent), signing = name(signingAgentId || null);
  const parts: string[] = [];
  if (intake) parts.push(`${name(lead.intake_agent_id) ? 'Intake' : 'Last call'}: ${intake}`);
  if (signing && signing !== intake) parts.push(`Agreement: ${signing}`);
  if (assigned && assigned !== intake && assigned !== signing) parts.push(`Assigned: ${assigned}`);
  return parts.join(' · ') || 'Agent not recorded';
}
