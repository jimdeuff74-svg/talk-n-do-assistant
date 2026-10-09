import { createFileRoute } from "@tanstack/react-router";

// Headless mode: the Pi sends a question, JD answers (same brain as the web app).
export const Route = createFileRoute("/api/public/pi/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkPi, db, json, toMessage } = await import("@/lib/pi.server");
        const denied = checkPi(request);
        if (denied) return denied;
        const body = (await request.json().catch(() => null)) as { text?: unknown; tz?: unknown } | null;
        const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
        if (!text) return json({ error: "champ 'text' requis" }, 400);
        const tz = typeof body?.tz === "string" ? body.tz.slice(0, 64) : "Europe/Paris";
        const { runJD } = await import("@/lib/jd.server");
        let out;
        try {
          out = await runJD({ history: [{ role: "user", content: text }], now: new Date().toLocaleString("fr-FR", { timeZone: tz }), tz });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "IA indisponible" }, 502);
        }
        // Stored already-claimed so /next does not replay it.
        const { data, error } = await (await db())
          .from("pi_messages")
          .insert({ text: out.reply, source: "pi", claimed_at: new Date().toISOString() })
          .select("id, text, created_at")
          .single();
        if (error || !data) return json({ error: "queue error" }, 500);
        return json({ message: toMessage(data, new URL(request.url).origin), action: out.action, videoId: out.videoId });
      },
    },
  },
});
