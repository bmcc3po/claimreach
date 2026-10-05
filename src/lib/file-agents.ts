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
