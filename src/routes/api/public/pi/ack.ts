import { createFileRoute } from "@tanstack/react-router";

// Optional: the Pi confirms a message was played.
export const Route = createFileRoute("/api/public/pi/ack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkPi, db, json } = await import("@/lib/pi.server");
        const denied = checkPi(request);
        if (denied) return denied;
        const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
        const id = typeof body?.id === "string" ? body.id : "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad id" }, 400);
        const { error } = await (await db()).from("pi_messages").update({ played_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ error: "queue error" }, 500);
        return json({ ok: true });
      },
    },
  },
});
