import { createFileRoute } from "@tanstack/react-router";

// Pi polls this: returns the oldest unread JD message exactly once (204 if none).
export const Route = createFileRoute("/api/public/pi/next")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { checkPi, db, json, toMessage } = await import("@/lib/pi.server");
        const denied = checkPi(request);
        if (denied) return denied;
        const { data, error } = await (await db()).rpc("claim_next_pi_message");
        if (error) return json({ error: "queue error" }, 500);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return new Response(null, { status: 204 });
        return json({ message: toMessage(row, new URL(request.url).origin) });
      },
    },
  },
});
