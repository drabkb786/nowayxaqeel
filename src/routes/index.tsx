import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noway Chat — Multi-Model AI Chat (GPT & Gemini)" },
      { name: "description", content: "Chat with GPT-5.5, GPT-5, Gemini 2.5 Pro and Flash in one clean interface. Streaming responses, custom system prompts, compare mode, and browser-saved history." },
      { property: "og:title", content: "Noway Chat" },
      { property: "og:description", content: "Multi-model AI chat: GPT and Gemini in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

const MODELS = [
  { id: "openai/gpt-5.5", label: "GPT-5.5", family: "openai", kind: "text" },
  { id: "openai/gpt-5", label: "GPT-5", family: "openai", kind: "text" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", family: "openai", kind: "text" },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", family: "openai", kind: "text" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", family: "google", kind: "text" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", family: "google", kind: "text" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", family: "google", kind: "text" },
  { id: "google/gemini-3-pro-image", label: "🎨 Image (Gemini 3 Pro)", family: "google", kind: "image" },
  { id: "google/gemini-3.1-flash-image", label: "🎨 Image (Nano Banana 2)", family: "google", kind: "image" },
  { id: "openai/gpt-image-2", label: "🎨 Image (GPT Image 2)", family: "openai", kind: "image" },
] as const;

const isImageModel = (id: string) => MODELS.find((m) => m.id === id)?.kind === "image";

type Thread = { id: string; title: string; updatedAt: number; messages: UIMessage[] };

const LS_THREADS = "noway.chat.threads.v1";
const LS_ACTIVE = "noway.chat.active.v1";
const LS_SYSTEM = "noway.chat.system.v1";
const LS_MODEL_A = "noway.chat.modelA.v1";
const LS_MODEL_B = "noway.chat.modelB.v1";
const LS_COMPARE = "noway.chat.compare.v1";

function loadThreads(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_THREADS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveThreads(t: Thread[]) { localStorage.setItem(LS_THREADS, JSON.stringify(t)); }

function newThread(): Thread {
  return { id: crypto.randomUUID(), title: "New chat", updatedAt: Date.now(), messages: [] };
}

function textOf(m: UIMessage): string {
  return (m.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
}

function ChatPage() {
  const [mounted, setMounted] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [system, setSystem] = useState("");
  const [modelA, setModelA] = useState<string>(MODELS[0].id);
  const [modelB, setModelB] = useState<string>(MODELS[4].id);
  const [compare, setCompare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Bootstrap once
  useEffect(() => {
    const stored = loadThreads();
    const list = stored.length ? stored : [newThread()];
    if (!stored.length) saveThreads(list);
    setThreads(list);
    const savedActive = localStorage.getItem(LS_ACTIVE);
    setActiveId(savedActive && list.find((t) => t.id === savedActive) ? savedActive : list[0].id);
    setSystem(localStorage.getItem(LS_SYSTEM) ?? "");
    setModelA(localStorage.getItem(LS_MODEL_A) ?? MODELS[0].id);
    setModelB(localStorage.getItem(LS_MODEL_B) ?? MODELS[4].id);
    setCompare(localStorage.getItem(LS_COMPARE) === "1");
    setMounted(true);
  }, []);

  useEffect(() => { if (mounted) localStorage.setItem(LS_ACTIVE, activeId); }, [activeId, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_SYSTEM, system); }, [system, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_MODEL_A, modelA); }, [modelA, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_MODEL_B, modelB); }, [modelB, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_COMPARE, compare ? "1" : "0"); }, [compare, mounted]);

  const active = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  const persistMessages = (id: string, messages: UIMessage[]) => {
    setThreads((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const firstUser = messages.find((m) => m.role === "user");
        const title = t.title === "New chat" && firstUser
          ? textOf(firstUser).slice(0, 40) || "New chat"
          : t.title;
        return { ...t, messages, updatedAt: Date.now(), title };
      });
      saveThreads(next);
      return next;
    });
  };

  const createThread = () => {
    const t = newThread();
    const next = [t, ...threads];
    setThreads(next); saveThreads(next);
    setActiveId(t.id);
    setSidebarOpen(false);
  };

  const deleteThread = (id: string) => {
    const next = threads.filter((t) => t.id !== id);
    const list = next.length ? next : [newThread()];
    setThreads(list); saveThreads(list);
    if (id === activeId) setActiveId(list[0].id);
  };

  if (!mounted || !active) {
    return <div className="min-h-screen bg-[#0a0912]" />;
  }

  return (
    <div className="h-screen bg-[#0a0912] text-white flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-30 w-72 bg-[#0a0912]/95 backdrop-blur border-r border-white/5 flex flex-col transition-transform`}>
        <div className="p-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#a56bff] to-[#22d3ee] flex items-center justify-center font-bold text-black text-sm">N</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">Noway Chat</div>
            <div className="text-[10px] text-white/40">GPT · Gemini</div>
          </div>
        </div>
        <button onClick={createThread} className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs font-semibold text-black bg-gradient-to-r from-[#a56bff] to-[#22d3ee] hover:brightness-110">
          + New chat
        </button>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((t) => (
            <div key={t.id} className={`group flex items-center gap-1 rounded-lg ${t.id === activeId ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}>
              <button
                onClick={() => { setActiveId(t.id); setSidebarOpen(false); }}
                className="flex-1 text-left px-3 py-2 text-xs truncate"
              >
                {t.title || "New chat"}
              </button>
              <button
                onClick={() => deleteThread(t.id)}
                className="opacity-0 group-hover:opacity-100 px-2 py-2 text-white/40 hover:text-red-400 text-xs transition"
                aria-label="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-white/5">
          <Link to="/id" className="text-[10px] text-white/40 hover:text-white/70 tracking-widest uppercase">
            → ID Generator
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 px-4 h-14 border-b border-white/5">
          <button onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden p-2 rounded-md hover:bg-white/5" aria-label="Toggle sidebar">☰</button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ModelPicker value={modelA} onChange={setModelA} />
            {compare && (
              <>
                <span className="text-white/30 text-xs">vs</span>
                <ModelPicker value={modelB} onChange={setModelB} />
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[#a56bff]" />
            Compare
          </label>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="px-3 py-1.5 rounded-md text-[11px] border border-white/10 hover:bg-white/5"
          >
            System
          </button>
        </header>

        {showSettings && (
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <label className="text-[10px] tracking-widest uppercase text-white/40">System prompt</label>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              rows={3}
              placeholder="You are a helpful assistant..."
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm outline-none focus:border-white/30"
            />
            <p className="text-[10px] text-white/30 mt-1">Applied to every new message in this chat. Empty = model default.</p>
          </div>
        )}

        {compare ? (
          <CompareView
            key={active.id}
            threadId={active.id}
            initialMessages={active.messages}
            modelA={modelA}
            modelB={modelB}
            system={system}
            onMessagesChange={(m) => persistMessages(active.id, m)}
          />
        ) : (
          <SingleChat
            key={active.id}
            threadId={active.id}
            initialMessages={active.messages}
            model={modelA}
            system={system}
            onMessagesChange={(m) => persistMessages(active.id, m)}
          />
        )}
      </main>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-20 lg:hidden" />
      )}
    </div>
  );
}

function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-xs outline-none hover:bg-white/[0.08] cursor-pointer"
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id} className="bg-[#0a0912]">{m.label}</option>
      ))}
    </select>
  );
}

function SingleChat({
  threadId, initialMessages, model, system, onMessagesChange,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  model: string;
  system: string;
  onMessagesChange: (m: UIMessage[]) => void;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ model, system }),
    }),
    [model, system],
  );

  const { messages, setMessages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<{ name: string; dataUrl: string; type: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onMsgRef = useRef(onMessagesChange);
  useEffect(() => { onMsgRef.current = onMessagesChange; });
  useEffect(() => { onMsgRef.current(messages); }, [messages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status, imgBusy]);
  useEffect(() => { textareaRef.current?.focus(); }, [threadId, status]);

  const busy = status === "submitted" || status === "streaming" || imgBusy;

  const generateImage = async (prompt: string) => {
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
    };
    setMessages([...messages, userMsg]);
    setImgBusy(true);
    setImgErr(null);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { b64_json, mediaType } = (await res.json()) as { b64_json: string; mediaType: string };
      const dataUrl = `data:${mediaType};base64,${b64_json}`;
      const asstMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: `![generated image](${dataUrl})` }],
      };
      setMessages((prev) => [...prev, asstMsg]);
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImgBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || (!input.trim() && !attached)) return;
    const prompt = input.trim();
    // Auto-detect image request even on text models
    const wantsImage = isImageModel(model) || looksLikeImageRequest(prompt);
    if (wantsImage) {
      if (!prompt) return;
      setInput("");
      setAttached(null);
      const imgModel = isImageModel(model) ? model : "google/gemini-3-pro-image";
      void generateImage(prompt, imgModel);
      return;
    }
    if (attached && attached.type.startsWith("image/")) {
      sendMessage({
        role: "user",
        parts: [
          ...(prompt ? [{ type: "text" as const, text: prompt }] : []),
          { type: "file" as const, mediaType: attached.type, url: attached.dataUrl, filename: attached.name },
        ],
      });
    } else {
      sendMessage({ text: prompt });
    }
    setInput("");
    setAttached(null);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { alert("Max 8MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setAttached({ name: f.name, dataUrl: reader.result as string, type: f.type || "image/png" });
    reader.readAsDataURL(f);
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-2xl font-semibold bg-gradient-to-r from-[#a56bff] to-[#22d3ee] bg-clip-text text-transparent">
                Kya poochhna hai?
              </div>
              <p className="text-white/40 text-sm mt-2">Text ke liye GPT/Gemini, picture ke liye 🎨 Image model select karo.</p>
            </div>
          )}
          {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
          {(status === "submitted" || imgBusy) && (
            <div className="text-xs text-white/40 animate-pulse">{imgBusy ? "🎨 Generating image…" : "Thinking…"}</div>
          )}
          {(error || imgErr) && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error?.message ?? imgErr}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-white/5 p-3">
        <div className="max-w-3xl mx-auto">
          {attached && (
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 text-xs">
              <span>📎</span>
              <span className="flex-1 truncate">{attached.name}</span>
              <button type="button" onClick={() => setAttached(null)} className="text-white/40 hover:text-white">✕</button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-white/20">
            <label className="cursor-pointer text-white/50 hover:text-white p-1" title="Attach image">
              📎
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
              placeholder="Message…"
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-white/30 max-h-48 py-1"
            />
            {busy ? (
              <button type="button" onClick={stop} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20">Stop</button>
            ) : (
              <button type="submit" disabled={!input.trim() && !attached} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#a56bff] to-[#22d3ee] text-black text-xs font-semibold disabled:opacity-40">
                Send ↑
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}

function CompareView({
  threadId, initialMessages, modelA, modelB, system, onMessagesChange,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  modelA: string;
  modelB: string;
  system: string;
  onMessagesChange: (m: UIMessage[]) => void;
}) {
  // Compare mode: send once, get two responses, store as pairs.
  const [pairs, setPairs] = useState<{ user: string; a: string; b: string; aErr?: string; bErr?: string }[]>(() => {
    // Load from initialMessages if they were saved as compare pairs (encoded)
    const out: { user: string; a: string; b: string }[] = [];
    for (let i = 0; i < initialMessages.length; i += 2) {
      const u = initialMessages[i];
      const asst = initialMessages[i + 1];
      if (u?.role !== "user" || !asst) continue;
      const t = textOf(asst);
      const [a = "", b = ""] = t.split("\n---COMPARE---\n");
      out.push({ user: textOf(u), a, b });
    }
    return out;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onMsgRef = useRef(onMessagesChange);
  useEffect(() => { onMsgRef.current = onMessagesChange; });
  useEffect(() => {
    const merged: UIMessage[] = pairs.flatMap((p, i) => [
      { id: `u${i}`, role: "user" as const, parts: [{ type: "text" as const, text: p.user }] },
      { id: `a${i}`, role: "assistant" as const, parts: [{ type: "text" as const, text: `${p.a}\n---COMPARE---\n${p.b}` }] },
    ]);
    onMsgRef.current(merged);
  }, [pairs]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [pairs, loading]);

  const callModel = async (model: string, history: { role: string; content: string }[]) => {
    const msgs: UIMessage[] = history.map((h, i) => ({
      id: `h${i}`,
      role: h.role as "user" | "assistant",
      parts: [{ type: "text", text: h.content }],
    }));
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: msgs, model, system }),
    });
    if (!res.ok) throw new Error(await res.text());
    // Read UI message stream: extract text-delta events
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "text-delta" && typeof evt.delta === "string") out += evt.delta;
          if (evt.type === "text" && typeof evt.text === "string") out = evt.text;
        } catch { /* skip */ }
      }
    }
    return out;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !input.trim()) return;
    const user = input.trim();
    setInput("");
    setLoading(true);
    const history = pairs.flatMap((p) => [
      { role: "user", content: p.user },
      { role: "assistant", content: p.a }, // use A history for both
    ]);
    history.push({ role: "user", content: user });
    setPairs((prev) => [...prev, { user, a: "", b: "" }]);
    try {
      const [a, b] = await Promise.allSettled([
        callModel(modelA, history),
        callModel(modelB, history.map((h, i, arr) => (i === arr.length - 2 ? { ...h, content: pairs[Math.floor(i / 2)]?.b ?? h.content } : h))),
      ]);
      setPairs((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        last.a = a.status === "fulfilled" ? a.value : "";
        last.aErr = a.status === "rejected" ? String(a.reason).slice(0, 300) : undefined;
        last.b = b.status === "fulfilled" ? b.value : "";
        last.bErr = b.status === "rejected" ? String(b.reason).slice(0, 300) : undefined;
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const modelLabel = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          {pairs.length === 0 && (
            <div className="text-center py-20 text-white/40 text-sm">
              Compare mode — same prompt do models ko jayega, jawab side-by-side.
            </div>
          )}
          {pairs.map((p, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-2xl px-4 py-2 rounded-2xl bg-gradient-to-r from-[#a56bff] to-[#6d5cff] text-black text-sm">
                  {p.user}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <ComparePanel label={modelLabel(modelA)} text={p.a} error={p.aErr} loading={loading && i === pairs.length - 1 && !p.a && !p.aErr} />
                <ComparePanel label={modelLabel(modelB)} text={p.b} error={p.bErr} loading={loading && i === pairs.length - 1 && !p.b && !p.bErr} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="border-t border-white/5 p-3">
        <div className="max-w-6xl mx-auto flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-white/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
            placeholder="Prompt for both models…"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-white/30 max-h-48 py-1"
          />
          <button type="submit" disabled={loading || !input.trim()} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#a56bff] to-[#22d3ee] text-black text-xs font-semibold disabled:opacity-40">
            {loading ? "…" : "Send ↑"}
          </button>
        </div>
      </form>
    </>
  );
}

function ComparePanel({ label, text, error, loading }: { label: string; text: string; error?: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] tracking-widest uppercase text-white/40 mb-2">{label}</div>
      {loading && <div className="text-xs text-white/40 animate-pulse">Thinking…</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}
      {text && (
        <div className="prose prose-sm prose-invert max-w-none text-sm">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  const textParts = (m.parts ?? []).filter((p) => p.type === "text") as Array<{ type: "text"; text: string }>;
  const fileParts = (m.parts ?? []).filter((p) => p.type === "file") as Array<{ type: "file"; url: string; mediaType: string; filename?: string }>;
  const text = textParts.map((p) => p.text).join("");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl space-y-2">
          {fileParts.map((f, i) => (
            f.mediaType.startsWith("image/") ? (
              <img key={i} src={f.url} alt={f.filename ?? "attachment"} className="rounded-xl max-h-64 ml-auto block" />
            ) : (
              <div key={i} className="text-xs text-white/60 ml-auto">📎 {f.filename}</div>
            )
          ))}
          {text && (
            <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#a56bff] to-[#6d5cff] text-black text-sm whitespace-pre-wrap">
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
      <ReactMarkdown>{text || " "}</ReactMarkdown>
    </div>
  );
}
