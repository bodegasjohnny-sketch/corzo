// Preferred ingest: ElevenLabs post-call webhook (post_call_transcription). Verifies the ElevenLabs-Signature header
// (t=<ts>,v0=<hmac_sha256(secret, `${ts}.${body}`)>) using Supabase secret ELEVENLABS_WEBHOOK_SECRET, then upserts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENT_ID, toRow } from "../_shared/map.ts";
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET") ?? (await sb.rpc("corzo_get_secret", { p_name: "ELEVENLABS_WEBHOOK_SECRET" })).data;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });
  const body = await req.text();
  const sig = req.headers.get("elevenlabs-signature") ?? "";
  const ts = sig.match(/t=(\d+)/)?.[1]; const v0 = sig.match(/v0=([a-f0-9]+)/)?.[1];
  if (!ts || !v0 || Math.abs(Date.now() / 1000 - Number(ts)) > 1800 || (await hmac(secret, `${ts}.${body}`)) !== v0) return new Response("bad signature", { status: 401 });
  const evt = JSON.parse(body);
  if (evt?.type !== "post_call_transcription" || evt?.data?.agent_id !== AGENT_ID) return new Response("ignored", { status: 200 });
  const { error } = await sb.from("corzo_calls").upsert({ ...toRow(evt.data), has_audio: true });
  return new Response(error ? error.message : "ok", { status: error ? 500 : 200 });
});
