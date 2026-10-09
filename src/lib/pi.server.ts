// Server-only helpers for the headless Raspberry Pi endpoints.
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Returns a 401/500 Response if the caller is not the Pi, otherwise null. */
export function checkPi(request: Request): Response | null {
  const expected = process.env["PI_DEVICE_TOKEN"];
  if (!expected || expected.length < 16) return json({ error: "PI_DEVICE_TOKEN non configuré" }, 500);
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!got || !safeEqual(got, expected)) return json({ error: "unauthorized" }, 401);
  return null;
}

export const toMessage = (row: { id: string; text: string; created_at: string }, origin: string) => ({
  id: row.id,
  text: row.text,
  created_at: row.created_at,
  audio_url: `${origin}/api/public/pi/audio/${row.id}`,
});

export async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function ttsWav(text: string): Promise<Response> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [{ role: "user", parts: [{ text: `Dis en français, d'une voix grave, posée et assez rapide : ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
      },
      stream_format: "audio",
    }),
  });
  if (!res.ok || !res.body) return json({ error: `tts ${res.status}` }, res.status === 402 ? 402 : 502);
  return new Response(res.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" } });
}
