// Maps an ElevenLabs conversation (GET /v1/convai/conversations/{id} or post_call_transcription webhook `data`) to a corzo_calls row.
// Public table: phone numbers are masked to last 4 digits BEFORE storage, and long digit runs in the transcript are masked too.
const W = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
const wordRun = new RegExp(`\\b${W}(?:[\\s,.-]+${W}){6,}\\b`, "gi");
const maskWords = (s: string) => s.replace(wordRun, "[number withheld]");
export const AGENT_ID = "agent_8401m5bvzmy6escbffygpnekg7mt";
const maskDigits = (s: string) => s.replace(/(\+?\d[\d\s().-]{5,}\d)/g, (m) => { const d = m.replace(/\D/g, ""); return d.length >= 7 ? "•••-" + d.slice(-4) : m; });
export function toRow(c: any) {
  const dc = c?.analysis?.data_collection_results ?? {};
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries<any>(dc)) fields[k] = v?.value ?? null;
  if (fields.phone) { const d = String(fields.phone).replace(/\D/g, ""); fields.phone = d.length >= 4 ? "•••-•••-" + d.slice(-4) : "(given)"; }
  const transcript = (c?.transcript ?? []).filter((t: any) => t?.message).map((t: any) => ({ role: t.role, t: t.time_in_call_secs ?? null, message: maskWords(maskDigits(String(t.message))) }));
  const md = c?.metadata ?? {};
  return {
    conversation_id: c.conversation_id,
    started_at: md.start_time_unix_secs ? new Date(md.start_time_unix_secs * 1000).toISOString() : null,
    duration: md.call_duration_secs ?? null,
    status: (fields.intake_status as string) ?? "needs_review",
    summary: (fields.handoff_summary as string) || c?.analysis?.transcript_summary || null,
    fields, transcript,
    has_audio: !!(c?.has_audio ?? c?.has_user_audio),
    updated_at: new Date().toISOString(),
  };
}
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
