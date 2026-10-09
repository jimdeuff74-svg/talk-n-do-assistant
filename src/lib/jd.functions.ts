import { createServerFn } from "@tanstack/react-start";
import { runJD, youtubeId, type JDInput } from "./jd.server";

export const askJD = createServerFn({ method: "POST" })
  .inputValidator((d: JDInput) => d)
  .handler(async ({ data }) => runJD(data));

export const quickYT = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => d)
  .handler(async ({ data }) => ({ videoId: await youtubeId(data.q) }));

// Ajoute une phrase de JD à la file du Raspberry Pi (texte seulement, borné).
export const enqueuePi = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) => {
    const text = String(d?.text ?? "").trim().slice(0, 1000);
    if (!text) throw new Error("texte vide");
    return { text };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pi_messages").insert({ text: data.text, source: "browser" });
    if (error) throw new Error("File Pi indisponible");
    return { ok: true };
  });
