import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant"; content: string };
type Action = { type: string; query: string; datetime: string; title: string };
type Out = { reply: string; action: Action };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "action"],
  properties: {
    reply: { type: "string" },
    action: {
      type: "object",
      additionalProperties: false,
      required: ["type", "query", "datetime", "title"],
      properties: {
        type: { type: "string", enum: ["none", "search", "youtube", "alarm", "event", "open_url", "sleep"] },
        query: { type: "string" },
        datetime: { type: "string" },
        title: { type: "string" },
      },
    },
  },
};

async function callModel(system: string, history: Msg[]): Promise<Out> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "Lovable-API-Key": process.env["LOVABLE_API_KEY"] ?? "",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      input: [{ role: "system", content: system }, ...history],
      text: { format: { type: "json_schema", name: "jd", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Crédits IA épuisés.");
    if (res.status === 429) throw new Error("Trop de requêtes, réessayez dans un instant.");
    throw new Error(`Erreur IA ${res.status} ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta;
      } catch {}
    }
  }
  return JSON.parse(text) as Out;
}

async function webSearch(q: string): Promise<string> {
  try {
    const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await r.text();
    const out: string[] = [];
    const re = /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && out.length < 6) {
      out.push(`- ${(m[1] ?? "").replace(/<[^>]+>/g, "")}: ${(m[2] ?? "").replace(/<[^>]+>/g, "")}`);
    }
    return out.join("\n") || "Aucun résultat.";
  } catch {
    return "Recherche indisponible.";
  }
}

async function youtubeId(q: string): Promise<string | null> {
  try {
    const r = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(q), {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "fr-FR" },
    });
    const m = (await r.text()).match(/"videoId":"([\w-]{11})"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export const askJD = createServerFn({ method: "POST" })
  .inputValidator((d: { history: Msg[]; now: string; tz: string }) => d)
  .handler(async ({ data }) => {
    const system = `Tu es JD 2.0, un assistant vocal type J.A.R.V.I.S., masculin, élégant, légèrement british, ultra compétent et quasi omniscient. Réponds en français, de façon concise et orale (1 à 3 phrases courtes, droit au but, sauf si on demande du détail). Tu peux répondre à absolument tout sujet, sans markdown ni listes.
Date/heure actuelle: ${data.now} (fuseau ${data.tz}).
Actions possibles (champ action):
- search: infos récentes/actualité/météo/prix -> query = requête web.
- youtube: jouer musique/vidéo -> query = recherche YouTube.
- alarm: alarme/minuteur -> datetime ISO 8601 local complet, title = libellé.
- event: ajouter au calendrier -> datetime ISO, title.
- open_url: ouvrir un site -> query = URL complète.
- sleep: si on te dit de te taire / tais-toi / mets-toi en veille.
- none sinon. Laisse les champs inutiles vides "".`;
    let out = await callModel(system, data.history.slice(-8));
    let videoId: string | null = null;
    if (out.action.type === "search" && out.action.query) {
      const results = await webSearch(out.action.query);
      out = await callModel(
        system + `\n\nRésultats web pour "${out.action.query}":\n${results}\nRéponds maintenant à l'utilisateur à partir de ces résultats, avec action none.`,
        data.history.slice(-8),
      );
      out.action = { type: "none", query: "", datetime: "", title: "" };
    }
    if (out.action.type === "youtube" && out.action.query) videoId = await youtubeId(out.action.query);
    return { ...out, videoId };
  });
