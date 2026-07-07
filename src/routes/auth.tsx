import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Noway Chat" },
      { name: "description", content: "Sign in ya account banao Noway Chat me apni chat history ko save karne ke liye." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

// Username → synthetic email mapping (Supabase requires an email under the hood)
function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `${clean}@user.noway`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Already signed in? Bounce to app.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const uname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (uname.length < 3) return setErr("Username kam se kam 3 characters ka ho (a–z, 0–9, _).");
    if (password.length < 6) return setErr("Password kam se kam 6 characters ka ho.");
    setBusy(true);
    try {
      const email = usernameToEmail(uname);
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: uname },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        // Auto-confirm is on server side; try immediate sign-in in case session not returned.
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/", replace: true });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      // Friendlier message for common cases
      if (/Invalid login credentials/i.test(msg)) setErr("Username ya password galat hai.");
      else if (/already registered|already exists/i.test(msg)) setErr("Ye username pehle se registered hai — sign in try karo.");
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0912] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a56bff] to-[#22d3ee] flex items-center justify-center font-bold text-black">N</div>
          <div>
            <div className="font-semibold">Noway Chat</div>
            <div className="text-[10px] text-white/40 tracking-widest uppercase">
              {mode === "signin" ? "Sign in" : "Create account"}
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <label className="block">
            <span className="text-[10px] tracking-widest uppercase text-white/40">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="e.g. ali_khan"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-white/30"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-widest uppercase text-white/40">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm outline-none focus:border-white/30"
            />
          </label>

          {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{err}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-black bg-gradient-to-r from-[#a56bff] to-[#22d3ee] hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => { setErr(null); setMode(mode === "signin" ? "signup" : "signin"); }}
            className="w-full text-[11px] text-white/60 hover:text-white pt-1"
          >
            {mode === "signin" ? "Naya account chahiye? Sign up karo →" : "Pehle se account hai? Sign in →"}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link to="/id" className="text-[10px] text-white/30 hover:text-white/60 tracking-widest uppercase">
            → ID Generator
          </Link>
        </div>
      </div>
    </div>
  );
}
