import { createFileRoute } from "@tanstack/react-router";

// Public: the Raspberry Pi fetches this URL directly to play JD's voice (WAV).
export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const text = (new URL(request.url).searchParams.get("t") || "").slice(0, 600).trim();
        if (!text) return new Response("missing text", { status: 400 });
        const key = process.env["LOVABLE_API_KEY"];
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
        if (!res.ok || !res.body) return new Response(await res.text(), { status: res.status });
        return new Response(res.body, {
          headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
