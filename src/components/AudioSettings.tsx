import { useEffect, useRef, useState } from "react";
import { Settings, Mic, Speaker, Volume2, RefreshCw, X } from "lucide-react";

export const SINK_KEY = "jd-sink";
export const MIC_KEY = "jd-mic";

/** Applique la sortie choisie à un AudioContext (Chrome 110+). */
export async function applySink(ctx: AudioContext) {
  const id = localStorage.getItem(SINK_KEY);
  const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (id && c.setSinkId) {
    try { await c.setSinkId(id === "default" ? "" : id); } catch {}
  }
}

export function AudioSettings() {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState("default");
  const [sink, setSink] = useState("default");
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("");
  const sinkSupported = typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  async function refresh() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setStatus("Autorisez le micro pour voir les noms des appareils.");
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    setInputs(all.filter((d) => d.kind === "audioinput"));
    setOutputs(all.filter((d) => d.kind === "audiooutput"));
  }

  useEffect(() => {
    setMic(localStorage.getItem(MIC_KEY) || "default");
    setSink(localStorage.getItem(SINK_KEY) || "default");
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const h = () => refresh();
    navigator.mediaDevices.addEventListener("devicechange", h);
    return () => navigator.mediaDevices.removeEventListener("devicechange", h);
  }, [open]);

  // Vu-mètre du micro sélectionné
  useEffect(() => {
    if (!open) return;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: mic === "default" ? true : { deviceId: { exact: mic } },
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setStatus("Impossible d'ouvrir ce micro.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [open, mic]);

  function chooseMic(id: string) { setMic(id); localStorage.setItem(MIC_KEY, id); }
  function chooseSink(id: string) { setSink(id); localStorage.setItem(SINK_KEY, id); }

  async function testSound() {
    setStatus("");
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.setValueAtTime(880, ctx.currentTime + 0.25);
    o.frequency.setValueAtTime(1100, ctx.currentTime + 0.5);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.connect(g).connect(dest);
    const el = new Audio();
    el.srcObject = dest.stream;
    const e = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    try {
      if (e.setSinkId) await e.setSinkId(sink === "default" ? "" : sink);
      await el.play();
      o.start(); o.stop(ctx.currentTime + 0.9);
      const name = outputs.find((d) => d.deviceId === sink)?.label || "sortie par défaut";
      setStatus(`Son envoyé vers : ${name}`);
      setTimeout(() => { el.pause(); ctx.close(); }, 1100);
    } catch {
      setStatus("Impossible d'utiliser cette sortie.");
      ctx.close();
    }
  }

  const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Paramètres audio" className="text-muted-foreground transition-colors hover:text-primary">
        <Settings className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="panel-title !mb-0">Paramètres audio</h2>
              <div className="flex gap-3">
                <button onClick={refresh} aria-label="Rafraîchir" className="text-muted-foreground hover:text-primary"><RefreshCw className="h-4 w-4" /></button>
                <button onClick={() => setOpen(false)} aria-label="Fermer" className="text-muted-foreground hover:text-primary"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <label className="mb-2 flex items-center gap-2 font-display text-[11px] tracking-widest text-primary"><Mic className="h-4 w-4" /> ENTRÉE (MICRO)</label>
            <select value={mic} onChange={(e) => chooseMic(e.target.value)} className="hud-select">
              {inputs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, "Micro")}</option>)}
            </select>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
            </div>

            <label className="mb-2 mt-6 flex items-center gap-2 font-display text-[11px] tracking-widest text-primary"><Speaker className="h-4 w-4" /> SORTIE (HAUT-PARLEUR / JACK)</label>
            {sinkSupported ? (
              <select value={sink} onChange={(e) => chooseSink(e.target.value)} className="hud-select">
                {outputs.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, "Sortie")}</option>)}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">Ce navigateur ne permet pas de choisir la sortie (utilisez Chrome ou Edge).</p>
            )}

            <button onClick={testSound} className="btn-hud mt-6 flex w-full items-center justify-center gap-2"><Volume2 className="h-4 w-4" /> Tester le son</button>
            {status && <p className="mt-3 text-center text-sm text-muted-foreground">{status}</p>}
            <p className="mt-4 text-xs text-muted-foreground">Note : la reconnaissance vocale et la voix de JD utilisent le micro et le haut-parleur par défaut du système. Les bips d'alarme et le test suivent la sortie choisie.</p>
          </div>
        </div>
      )}
    </>
  );
}
