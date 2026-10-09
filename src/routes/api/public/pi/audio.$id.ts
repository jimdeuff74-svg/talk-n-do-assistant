import { createFileRoute } from "@tanstack/react-router";

// WAV (male voice) for one queued message. Requires the Pi token.
export const Route = createFileRoute("/api/public/pi/audio/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { checkPi, db, json, ttsWav } = await import("@/lib/pi.server");
        const denied = checkPi(request);
        if (denied) return denied;
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ error: "bad id" }, 400);
        const { data } = await (await db()).from("pi_messages").select("text").eq("id", params.id).maybeSingle();
        if (!data) return json({ error: "not found" }, 404);
        return ttsWav(data.text);
      },
    },
  },
});
