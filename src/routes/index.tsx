import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { askJD } from "@/lib/jd.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JD 2.0 — Assistant vocal" },
      { name: "description", content: "JD 2.0, assistant vocal façon J.A.R.V.I.S. : recherche web, musique YouTube, alarmes, calendrier." },
      { property: "og:title", content: "JD 2.0 — Assistant vocal" },
      { property: "og:description", content: "Dites « JD » pour réveiller votre assistant personnel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JD,
});

type Msg = { role: "user" | "assistant"; content: string };
type Item = { id: number; at: string; title: string; kind: "alarm" | "event"; done?: boolean };
type Mode = "off" | "sleep" | "awake" | "thinking" | "speaking";

const WAKE = /\b(j\.?\s?d|jd|jdé|jidé|gédé|g\.?\s?d|j'ai dit|jay dee|djé dé)\b/i;
const HUSH = /(tais[- ]?toi|tait[- ]?toi|tai[st]?[- ]?toi|ta gueule|silence|mets[- ]toi en veille|ferme[- ]la)/i;

function JD() {
  const [mode, setMode] = useState<Mode>("off");
  const [log, setLog] = useState<Msg[]>([]);
  const [interim, setInterim] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [video, setVideo] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const recRef = useRef<any>(null);
  const modeRef = useRef<Mode>("off");
  const histRef = useRef<Msg[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const set = (m: Mode) => { modeRef.current = m; setMode(m); };

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("jd-items") || "[]")); } catch {}
    const pick = () => {
      const v = speechSynthesis.getVoices().filter((x) => x.lang.startsWith("fr"));
      voiceRef.current =
        v.find((x) => /thomas|henri|paul|male|homme|claude|nicolas|daniel|google.*fr/i.test(x.name) && !/amelie|aurelie|marie|julie|female|denise|hortense|virginie|audrey/i.test(x.name)) ||
        v.find((x) => !/amelie|aurelie|marie|julie|female|denise|hortense|virginie|audrey/i.test(x.name)) || v[0] || null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("fr-FR")), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { localStorage.setItem("jd-items", JSON.stringify(items)); }, [items]);

  // alarm checker
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setItems((list) => list.map((it) => {
        if (!it.done && it.kind === "alarm" && new Date(it.at).getTime() <= now) {
          beep();
          speak(`Alarme : ${it.title || "il est l'heure"}.`);
          return { ...it, done: true };
        }
        return it;
      }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function beep() {
    try {
      const ctx = new AudioContext();
      [0, 0.3, 0.6].forEach((d) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.2, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.25);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.25);
      });
    } catch {}
  }

  function startRec() {
    try { recRef.current?.start(); } catch {}
  }

  function speak(text: string, after: Mode = "awake") {
    const prev = modeRef.current === "sleep" ? "sleep" : after;
    set("speaking");
    try { recRef.current?.abort(); } catch {}
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR"; u.pitch = 0.85; u.rate = 1.02;
    if (voiceRef.current) u.voice = voiceRef.current;
    const done = () => { set(prev); setTimeout(startRec, 250); };
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  }

  function addMsg(m: Msg) {
    histRef.current = [...histRef.current, m].slice(-20);
    setLog([...histRef.current]);
  }

  async function handle(text: string) {
    addMsg({ role: "user", content: text });
    set("thinking");
    try { recRef.current?.abort(); } catch {}
    try {
      const r = await askJD({ data: { history: histRef.current, now: new Date().toString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      addMsg({ role: "assistant", content: r.reply });
      const a = r.action;
      if (a.type === "youtube") setVideo(r.videoId);
      if (a.type === "open_url" && a.query) window.open(a.query, "_blank");
      if ((a.type === "alarm" || a.type === "event") && a.datetime)
        setItems((l) => [...l, { id: Date.now(), at: a.datetime, title: a.title, kind: a.type as "alarm" | "event" }]);
      speak(r.reply, a.type === "sleep" ? "sleep" : "awake");
      if (a.type === "sleep") modeRef.current = "sleep";
    } catch (e: any) {
      speak("Désolé, une erreur est survenue. " + (e?.message || ""));
    }
  }

  function init() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Reconnaissance vocale non supportée. Utilisez Chrome ou Edge."); return; }
    const rec = new SR();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: any) => {
      let fin = ""; let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else tmp += t;
      }
      setInterim(tmp);
      if (!fin.trim()) return;
      const m = modeRef.current;
      if (m === "speaking" || m === "thinking") return;
      if (m === "sleep") {
        if (WAKE.test(fin)) {
          const rest = fin.replace(WAKE, "").replace(/2[.,]?0|deux point zéro|!/gi, "").trim();
          set("awake");
          if (rest.length > 3) handle(rest); else speak("Oui monsieur, je vous écoute.");
        }
        return;
      }
      if (HUSH.test(fin)) { set("sleep"); speechSynthesis.cancel(); setInterim(""); return; }
      handle(fin.trim());
    };
    rec.onend = () => { if (modeRef.current === "sleep" || modeRef.current === "awake") setTimeout(startRec, 200); };
    rec.onerror = () => {};
    recRef.current = rec;
    set("sleep");
    startRec();
    speak("Systèmes en ligne. Dites JD quand vous aurez besoin de moi.", "sleep");
    modeRef.current = "speaking";
    setTimeout(() => {}, 0);
  }

  const label = { off: "HORS LIGNE", sleep: "VEILLE · DITES « JD 2.0 »", awake: "À L'ÉCOUTE", thinking: "ANALYSE…", speaking: "TRANSMISSION" }[mode];

  return (
    <main className="hud min-h-screen overflow-hidden text-foreground">
      <div className="hud-grid" />
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="font-display text-xl tracking-[0.4em] text-primary text-glow">JD 2.0</div>
        <div className="font-display text-sm tracking-[0.3em] text-muted-foreground">{clock}</div>
      </header>

      <section className="relative z-10 grid gap-6 px-6 pb-10 lg:grid-cols-[1fr_1.3fr_1fr]">
        <aside className="panel order-2 lg:order-1">
          <h2 className="panel-title">Journal</h2>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {log.length === 0 && <p className="text-sm text-muted-foreground">Aucune transmission.</p>}
            {log.map((m, i) => (
              <div key={i} className={m.role === "user" ? "msg-user" : "msg-ai"}>
                <span className="font-display text-[10px] tracking-widest opacity-60">{m.role === "user" ? "VOUS" : "JD"}</span>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
        </aside>

        <div className="order-1 flex flex-col items-center justify-center gap-8 lg:order-2">
          <div className={`reactor reactor-${mode}`} onClick={() => mode === "off" ? init() : mode === "sleep" ? (set("awake"), speak("Je vous écoute.")) : null}>
            <div className="ring r1" /><div className="ring r2" /><div className="ring r3" />
            <div className="core" />
          </div>
          <div className="text-center">
            <p className="font-display text-sm tracking-[0.35em] text-primary text-glow">{label}</p>
            <p className="mt-3 min-h-6 text-muted-foreground">{interim}</p>
          </div>
          {mode === "off" && (
            <button onClick={init} className="btn-hud">Initialiser le système</button>
          )}
          {video && (
            <div className="panel w-full">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="panel-title !mb-0">Lecture</h2>
                <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setVideo(null)}>FERMER</button>
              </div>
              <iframe className="aspect-video w-full rounded" src={`https://www.youtube.com/embed/${video}?autoplay=1`} allow="autoplay; encrypted-media" allowFullScreen />
            </div>
          )}
        </div>

        <aside className="panel order-3">
          <h2 className="panel-title">Alarmes & Agenda</h2>
          <div className="flex flex-col gap-2">
            {items.length === 0 && <p className="text-sm text-muted-foreground">« JD, réveille-moi à 7h »</p>}
            {[...items].sort((a, b) => a.at.localeCompare(b.at)).map((it) => (
              <div key={it.id} className={`item ${it.done ? "opacity-40" : ""}`}>
                <div>
                  <span className="font-display text-[10px] tracking-widest text-primary">{it.kind === "alarm" ? "ALARME" : "ÉVÉNEMENT"}</span>
                  <p className="text-sm">{it.title || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(it.at).toLocaleString("fr-FR")}</p>
                </div>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>✕</button>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
