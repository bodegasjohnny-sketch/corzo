// Fallback ingest: pulls the Corzo agent's conversations from ElevenLabs and upserts them. Called by /calls/ on load; rate-limited to once per 60s.
// GET ?audio=<conversation_id> streams that call's audio (key stays server-side).
// Requires Supabase secret ELEVENLABS_API_KEY (never shipped to the browser or the repo).
import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENT_ID, toRow, cors } from "../_shared/map.ts";
const XI = "https://api.elevenlabs.io/v1/convai";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (!key) return json({ ok: false, error: "ELEVENLABS_API_KEY secret not set" }, 503);
  const url = new URL(req.url);
  const audio = url.searchParams.get("audio");
  if (audio) {
    if (!/^conv_[a-z0-9]+$/i.test(audio)) return json({ error: "bad id" }, 400);
    const c = await (await fetch(`${XI}/conversations/${audio}`, { headers: { "xi-api-key": key } })).json();
    if (c?.agent_id !== AGENT_ID) return json({ error: "not found" }, 404);
    const r = await fetch(`${XI}/conversations/${audio}/audio`, { headers: { "xi-api-key": key } });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("content-type") ?? "audio/mpeg", "Cache-Control": "public, max-age=3600" } });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: st } = await sb.from("corzo_sync_state").select("last_run").eq("id", 1).single();
  if (st?.last_run && Date.now() - new Date(st.last_run).getTime() < 60_000) return json({ ok: true, skipped: "rate_limited" });
  await sb.from("corzo_sync_state").update({ last_run: new Date().toISOString() }).eq("id", 1);
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const list = await (await fetch(`${XI}/conversations?agent_id=${AGENT_ID}&page_size=20&call_start_after_unix=${since}`, { headers: { "xi-api-key": key } })).json();
  let n = 0;
  for (const c of list?.conversations ?? []) {
    if (c.status !== "done") continue;
    const { data: ex } = await sb.from("corzo_calls").select("conversation_id").eq("conversation_id", c.conversation_id).maybeSingle();
    if (ex) continue;
    const full = await (await fetch(`${XI}/conversations/${c.conversation_id}`, { headers: { "xi-api-key": key } })).json();
    const { error } = await sb.from("corzo_calls").upsert(toRow(full)); if (!error) n++;
  }
  return json({ ok: true, synced: n });
});
