import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function UserBadge() {
  const [name, setName] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
      setName(p?.display_name || data.user.email || "");
    });
  }, []);
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <span className="flex items-center gap-1 text-sm"><User className="h-4 w-4" />{name}</span>
      <button aria-label="Déconnexion" className="hover:text-primary" onClick={() => supabase.auth.signOut()}>
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (session === undefined) return <main className="hud min-h-screen" />;
  if (session) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
      });
      setMsg(error ? error.message : "Vérifiez votre email pour confirmer votre compte.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("Email ou mot de passe incorrect.");
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setMsg("Connexion Google impossible.");
  }

  return (
    <main className="hud flex min-h-screen items-center justify-center p-4 text-foreground">
      <div className="hud-grid" />
      <form onSubmit={submit} className="panel relative z-10 w-full max-w-sm">
        <h1 className="mb-1 text-center font-display text-2xl tracking-[0.4em] text-primary text-glow">JD 2.0</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">{mode === "in" ? "Identification requise" : "Créer un accès"}</p>
        {mode === "up" && (
          <input className="hud-select mb-3" placeholder="Pseudo" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className="hud-select mb-3" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="hud-select mb-4" type="password" placeholder="Mot de passe" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy} className="btn-hud w-full">{mode === "in" ? "Connexion" : "Inscription"}</button>
        <button type="button" onClick={google} className="mt-3 w-full rounded-full border border-border py-3 text-sm hover:border-primary hover:text-primary">Continuer avec Google</button>
        {msg && <p className="mt-4 text-center text-sm text-muted-foreground">{msg}</p>}
        <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }} className="mt-4 w-full text-xs tracking-widest text-muted-foreground hover:text-primary">
          {mode === "in" ? "PAS DE COMPTE ? S'INSCRIRE" : "DÉJÀ UN COMPTE ? SE CONNECTER"}
        </button>
      </form>
    </main>
  );
}
