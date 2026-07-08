import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { exportToGoogleDocs } from "@/lib/gdocs-export.functions";
import { FileText, Check, Loader2 } from "lucide-react";
import {
  Paperclip,
  Mic,
  ArrowUp,
  Square,
  Plus,
  Menu,
  Settings2,
  LogOut,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  PenLine,
  Code2,
  ImageIcon,
  X,
  
  
  Bell,
  Edit3,
  FileText as FileTextIcon,
  FileSpreadsheet,
  FileCode,
  Presentation,
  Zap,
  Languages,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllThreadsWithMessages,
  createThreadDb,
  deleteThreadDb,
  persistMessagesDb,
} from "@/lib/chat-store";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "NOWAYxAQEEL GPT — Multi-Model AI Chat (GPT & Gemini)" },
      { name: "description", content: "Chat with GPT-5.5, GPT-5, Gemini 2.5 Pro and Flash in one clean interface. Streaming responses, custom system prompts, compare mode, and cloud-saved history." },
      { property: "og:title", content: "NOWAYxAQEEL GPT" },
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

const IMAGE_INTENT = /\b(image|picture|photo|photograph|pic|poster|logo|icon|illustration|drawing|sketch|painting|render|artwork|wallpaper|thumbnail|avatar|banner|scene|portrait|meme|design|3d\s*render|tasveer|tasvir|photo\s*bana|picture\s*bana|image\s*bana|banao|bana\s*do|bana\s*ke|draw|paint|generate\s+(an?\s+)?(image|picture|photo|logo|icon))\b/i;
const CODE_INTENT = /\b(svg|html|css|code|snippet|script|component|function|json|xml|markdown|program)\b/i;
const PDF_INTENT = /\b(pdf|document|report|resume|cv|letter|invoice|proposal|whitepaper|brochure|guide|handbook|essay|article|contract|agreement|ebook|pdf\s*bana|document\s*bana|report\s*bana|pdf\s*banao)\b/i;
const FONT_RE = /\b(arial|helvetica|times(?:\s+new\s+roman)?|roboto|courier|georgia|verdana|calibri|serif|sans-?serif|monospace)\b/i;
const looksLikeImageRequest = (text: string) => IMAGE_INTENT.test(text) && !CODE_INTENT.test(text) && !PDF_INTENT.test(text);
const looksLikePdfRequest = (text: string) => PDF_INTENT.test(text);
const extractFont = (text: string): string | undefined => text.match(FONT_RE)?.[1];

type Thread = { id: string; title: string; updatedAt: number; messages: UIMessage[] };

const LS_ACTIVE = "noway.chat.active.v1";
const LS_SYSTEM = "noway.chat.system.v1";
const LS_MODEL_A = "noway.chat.modelA.v1";
const LS_MODEL_B = "noway.chat.modelB.v1";
const LS_COMPARE = "noway.chat.compare.v1";
const LS_THEME = "noway.chat.theme.v1";
const AUTH_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

const SUGGESTIONS = [
  { icon: PenLine, title: "Ek short story likho", prompt: "Ek chhoti si inspiring story likho, 200 words me." },
  { icon: Code2, title: "React hook samjhao", prompt: "React ke useEffect hook ko simple examples ke saath samjhao." },
  { icon: ImageIcon, title: "Ek image banao", prompt: "Ek modern minimalist mountain landscape ki image banao." },
  { icon: Sparkles, title: "Do cheezein compare karo", prompt: "Compare React vs Vue in 2026 for a new frontend project." },
];

function newThread(): Thread {
  return { id: crypto.randomUUID(), title: "New chat", updatedAt: Date.now(), messages: [] };
}

function textOf(m: UIMessage): string {
  return (m.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
}

function messagesSignature(messages: UIMessage[]): string {
  return JSON.stringify(messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts })));
}

function ChatPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [system, setSystem] = useState("");
  const [modelA, setModelA] = useState<string>(MODELS[0].id);
  const [modelB, setModelB] = useState<string>(MODELS[4].id);
  const [compare, setCompare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Theme: apply .dark on documentElement
  useEffect(() => {
    if (typeof document === "undefined") return;
    const saved = (localStorage.getItem(LS_THEME) as "light" | "dark" | null) ?? "dark";
    setTheme(saved);
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    if (mounted) localStorage.setItem(LS_THEME, theme);
  }, [theme, mounted]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userResult = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
      const user = userResult?.data.user;
      if (!user) {
        if (!cancelled) navigate({ to: "/auth", replace: true });
        return;
      }
      if (cancelled) return;
      setUserId(user.id);
      setUsername(String(user.user_metadata?.username ?? user.email?.split("@")[0] ?? "user"));

      let list: Thread[] = [];
      try {
        list = await fetchAllThreadsWithMessages(user.id);
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
      if (list.length === 0) {
        const t = newThread();
        try { await createThreadDb(user.id, t.id); } catch (e) { console.error(e); }
        list = [t];
      }
      if (cancelled) return;
      setThreads(list);
      const savedActive = localStorage.getItem(LS_ACTIVE);
      setActiveId(savedActive && list.find((t) => t.id === savedActive) ? savedActive : list[0].id);
      setSystem(localStorage.getItem(LS_SYSTEM) ?? "");
      setModelA(localStorage.getItem(LS_MODEL_A) ?? MODELS[0].id);
      setModelB(localStorage.getItem(LS_MODEL_B) ?? MODELS[4].id);
      setCompare(localStorage.getItem(LS_COMPARE) === "1");
      setMounted(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (mounted) localStorage.setItem(LS_ACTIVE, activeId); }, [activeId, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_SYSTEM, system); }, [system, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_MODEL_A, modelA); }, [modelA, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_MODEL_B, modelB); }, [modelB, mounted]);
  useEffect(() => { if (mounted) localStorage.setItem(LS_COMPARE, compare ? "1" : "0"); }, [compare, mounted]);

  const active = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  const persistMessages = useCallback((id: string, messages: UIMessage[]) => {
    const incomingSignature = messagesSignature(messages);
    let shouldPersist = false;
    let prevTitle = "New chat";
    setThreads((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        if (messagesSignature(t.messages) === incomingSignature) return t;
        changed = true;
        prevTitle = t.title;
        const firstUser = messages.find((m) => m.role === "user");
        const title = t.title === "New chat" && firstUser
          ? textOf(firstUser).slice(0, 40) || "New chat"
          : t.title;
        return { ...t, messages, updatedAt: Date.now(), title };
      });
      if (!changed) return prev;
      shouldPersist = true;
      return next;
    });
    if (shouldPersist && userId) {
      persistMessagesDb(id, userId, messages, prevTitle).catch((e) => console.error("persist failed", e));
    }
  }, [userId]);

  const handleActiveMessagesChange = useCallback((messages: UIMessage[]) => {
    if (!activeId) return;
    persistMessages(activeId, messages);
  }, [activeId, persistMessages]);

  const createThread = async () => {
    const t = newThread();
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setSidebarOpen(false);
    if (userId) {
      try { await createThreadDb(userId, t.id); } catch (e) { console.error(e); }
    }
  };

  const deleteThread = async (id: string) => {
    const remaining = threads.filter((t) => t.id !== id);
    let list = remaining;
    if (list.length === 0) {
      const t = newThread();
      list = [t];
      if (userId) { try { await createThreadDb(userId, t.id); } catch (e) { console.error(e); } }
    }
    setThreads(list);
    if (id === activeId) setActiveId(list[0].id);
    try { await deleteThreadDb(id); } catch (e) { console.error(e); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const sendSuggestion = (prompt: string) => {
    // Placed on window for SingleChat to pick up via custom event
    window.dispatchEvent(new CustomEvent("noway:suggest", { detail: prompt }));
  };

  if (!mounted || !active) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
        Loading your chats…
      </div>
    );
  }

  const sidebarWidth = sidebarCollapsed ? "lg:w-16" : "lg:w-72";

  const QUICK_ACTIONS = [
    { icon: ImageIcon, title: "Create Image", sub: "Generate with AI", tint: "text-mint", prompt: "Ek modern minimalist mountain landscape ki image banao." },
    { icon: Code2, title: "Code Assistant", sub: "Write & debug code", tint: "text-iris", prompt: "React ke useEffect hook ko simple examples ke saath samjhao." },
    { icon: FileTextIcon, title: "Summarize Text", sub: "Get key points", tint: "text-mint", prompt: "Summarize the following text into 5 key bullet points:" },
    { icon: Languages, title: "Translate", sub: "Multi-language", tint: "text-violet", prompt: "Translate this to English:" },
    { icon: Lightbulb, title: "Brainstorm Ideas", sub: "Get creative", tint: "text-mint", prompt: "Give me 10 creative startup ideas in the education space." },
    { icon: BarChart3, title: "Data Analysis", sub: "Analyze & visualize", tint: "text-iris", prompt: "Help me analyze this dataset and suggest visualizations:" },
  ];

  const RECENT_FILES = [
    { icon: FileTextIcon, name: "Project_Proposal.docx", meta: "2.4 MB · 2h ago", color: "text-blue-400" },
    { icon: FileSpreadsheet, name: "Data_Analysis.xlsx", meta: "1.8 MB · 5h ago", color: "text-emerald-400" },
    { icon: Presentation, name: "Presentation.pptx", meta: "5.2 MB · 1d ago", color: "text-orange-400" },
    { icon: FileCode, name: "Code_Snippet.py", meta: "2.1 KB · 2d ago", color: "text-yellow-400" },
  ];

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-30 w-72 ${sidebarWidth} bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-300 ease-out`}
      >
        <div className="p-3 flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden lg:flex w-9 h-9 items-center justify-center rounded-lg hover:bg-sidebar-accent/60 text-sidebar-foreground/70 shrink-0"
            aria-label="Collapse sidebar"
            title="Toggle sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className={`flex items-center gap-2 min-w-0 flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-mint via-mint-glow to-mint flex items-center justify-center font-black text-black text-[10px] tracking-tight shadow-[0_0_20px_-4px_var(--mint)]">NxA</div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">NOWAYxAQEEL GPT</div>
              <div className="text-[10px] text-sidebar-foreground/50">Powered by Gemini</div>
            </div>
          </div>
          <button
            onClick={createThread}
            title="New chat"
            className={`w-9 h-9 flex items-center justify-center rounded-lg hover:bg-sidebar-accent/60 text-sidebar-foreground/70 shrink-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-sidebar-accent/60"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`px-3 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
          <button
            onClick={createThread}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-sm font-semibold text-mint bg-mint/10 border border-mint/30 hover:bg-mint/15 hover:border-mint/50 transition shadow-[0_0_30px_-10px_var(--mint)]"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>


        <div className={`px-4 pt-4 pb-1 text-[10px] tracking-widest uppercase text-sidebar-foreground/40 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
          Recent
        </div>

        <div className={`flex-1 overflow-y-auto px-2 space-y-0.5 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
          {threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((t) => (
            <div key={t.id} className={`group flex items-center gap-1 rounded-xl transition ${t.id === activeId ? "bg-mint/10 border border-mint/25" : "hover:bg-sidebar-accent/50 border border-transparent"}`}>
              <button
                onClick={() => { setActiveId(t.id); setSidebarOpen(false); }}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-3 py-2.5"
              >
                <Sparkles className={`w-3.5 h-3.5 shrink-0 ${t.id === activeId ? "text-mint" : "text-sidebar-foreground/40"}`} />
                <span className="text-sm truncate">{t.title || "New chat"}</span>
              </button>
              <button
                onClick={() => deleteThread(t.id)}
                className="opacity-0 group-hover:opacity-100 px-2 py-2 text-sidebar-foreground/40 hover:text-red-400 transition"
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 space-y-3">
          <div className={`flex items-center gap-2 p-2 rounded-2xl bg-sidebar-accent/40 border border-sidebar-border ${sidebarCollapsed ? "lg:justify-center lg:p-0 lg:bg-transparent lg:border-0" : ""}`}>
            <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-mint to-mint-glow flex items-center justify-center text-black text-sm font-bold">
              {username.slice(0, 1).toUpperCase()}
            </div>
            <div className={`min-w-0 flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <div className="text-sm text-sidebar-foreground truncate">@{username}</div>
              <div className="text-[10px] text-mint">Pro Plan</div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className={`w-8 h-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent/70 text-sidebar-foreground/60 hover:text-sidebar-foreground ${sidebarCollapsed ? "lg:hidden" : ""}`}
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>


          <Link
            to="/id"
            className={`block text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 px-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}
          >
            → ID Generator
          </Link>
        </div>
      </aside>

      {/* Main + right rail */}
      <div className="flex-1 flex min-w-0">
        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center gap-2 px-3 sm:px-5 h-16 shrink-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
              <ModelPicker value={modelA} onChange={setModelA} />
              {compare && (
                <>
                  <span className="text-muted-foreground text-xs">vs</span>
                  <ModelPicker value={modelB} onChange={setModelB} />
                </>
              )}
            </div>
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setCompare((v) => !v)}
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                compare ? "bg-mint/15 border-mint/40 text-mint" : "bg-muted/60 border-border text-foreground hover:border-mint/30"
              }`}
              title="Compare mode"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Compare
            </button>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
              title="System prompt"
              aria-label="System prompt"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-mint to-mint-glow flex items-center justify-center text-black text-sm font-bold">
              {username.slice(0, 1).toUpperCase()}
            </div>
          </header>

          {showSettings && (
            <div className="px-4 sm:px-6 pb-3">
              <div className="emerald-panel px-4 py-3">
                <label className="text-[10px] tracking-widest uppercase text-muted-foreground">System prompt</label>
                <textarea
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  rows={3}
                  placeholder="You are a helpful assistant..."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background/60 border border-border text-sm outline-none focus:border-mint/40"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Applied to every new message in this chat. Empty = model default.
                </p>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 px-3 sm:px-5 pb-5">
            <div className="emerald-panel h-full flex flex-col overflow-hidden">
              {compare ? (
                <CompareView
                  key={active.id}
                  threadId={active.id}
                  initialMessages={active.messages}
                  modelA={modelA}
                  modelB={modelB}
                  system={system}
                  onMessagesChange={handleActiveMessagesChange}
                />
              ) : (
                <div className="flex-1 flex flex-col min-h-0 relative">
                  {threads.map((t) => (
                    <div
                      key={t.id}
                      className={`absolute inset-0 flex flex-col min-h-0 ${t.id === active.id ? "" : "hidden"}`}
                      aria-hidden={t.id !== active.id}
                    >
                      <SingleChat
                        threadId={t.id}
                        initialMessages={t.messages}
                        model={modelA}
                        system={system}
                        username={username}
                        onSuggestion={sendSuggestion}
                        onMessagesChange={(m) => persistMessages(t.id, m)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right rail — Quick Actions + Recent Files */}
        <aside className="hidden xl:flex w-80 shrink-0 flex-col gap-4 pr-5 py-5 overflow-y-auto">
          <div className="emerald-panel p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-mint" />
                <h3 className="text-sm font-semibold">Quick Actions</h3>
              </div>
              <div className="w-6 h-6 rounded-full bg-mint/15 border border-mint/30 flex items-center justify-center text-mint">
                <ArrowUp className="w-3 h-3" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {QUICK_ACTIONS.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.title}
                    onClick={() => sendSuggestion(q.prompt)}
                    className="group text-left rounded-2xl border border-border/70 bg-background/40 hover:bg-mint/5 hover:border-mint/30 p-3 transition"
                  >
                    <div className={`w-8 h-8 rounded-lg bg-background/70 border border-border/60 flex items-center justify-center ${q.tint}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="mt-2 text-[13px] font-semibold text-foreground leading-tight">{q.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{q.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="emerald-panel p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent Files</h3>
              <button className="text-[11px] text-mint hover:underline">View all</button>
            </div>
            <div className="mt-3 space-y-1">
              {RECENT_FILES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-mint/5 transition cursor-pointer">
                    <div className="w-9 h-9 rounded-lg bg-background/60 border border-border/60 flex items-center justify-center shrink-0">
                      <Icon className={`w-4 h-4 ${f.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{f.meta}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
        />
      )}
    </div>
  );
}
function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-4 pr-10 py-2.5 rounded-2xl bg-card/70 border border-mint/20 text-sm outline-none hover:border-mint/40 cursor-pointer text-foreground min-w-[220px] font-medium"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-background text-foreground">{m.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">▾</span>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-mint via-primary to-mint-glow flex items-center justify-center text-black text-[9px] font-black tracking-tight shadow-sm">
      NxA
    </div>
  );
}

function SingleChat({
  threadId, initialMessages, model, system, username, onMessagesChange, onSuggestion,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  model: string;
  system: string;
  username: string;
  onSuggestion: (prompt: string) => void;
  onMessagesChange: (m: UIMessage[]) => void;
}) {
  const [depth] = useState<"standard" | "extended">("extended");
  const [research] = useState(true);
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: research ? "/api/research" : "/api/chat",
      body: () => {
        const depthDirective =
          depth === "extended"
            ? "\n\nRESPONSE DEPTH: EXTENDED. Give an exhaustively detailed, deeply thorough response. Cover background, nuances, edge cases, examples, step-by-step reasoning, comparisons, pros/cons, and practical tips. Prefer long-form structured sections."
            : "\n\nRESPONSE DEPTH: STANDARD. Give a clear, detailed but focused answer — well structured, not overly long.";
        return { model, system: (system ?? "") + depthDirective };
      },
    }),
    [model, system, depth, research],
  );

  const seedMessages = useMemo(() => initialMessages, [threadId]);
  const { messages, setMessages, sendMessage, status, error, stop, regenerate } = useChat({
    id: threadId,
    messages: seedMessages,
    generateId: () => crypto.randomUUID(),
    experimental_throttle: 250,
    transport,
  });

  // Auto-retry on error (self-heal) — up to 2 attempts with backoff
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const lastErrorSigRef = useRef<string>("");
  useEffect(() => {
    if (!error) { retryCountRef.current = 0; lastErrorSigRef.current = ""; return; }
    const sig = `${error.message}|${messages.length}`;
    if (sig === lastErrorSigRef.current) return;
    lastErrorSigRef.current = sig;
    if (retryCountRef.current >= 2) return;
    if (!messages.some((m) => m.role === "user")) return;
    const attempt = ++retryCountRef.current;
    const delay = attempt === 1 ? 800 : 2200;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      try { regenerate?.(); } catch (e) { console.error("auto-retry failed", e); }
    }, delay);
    return () => {
      if (retryTimerRef.current) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, [error, messages, regenerate]);

  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<{ name: string; dataUrl: string; type: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

  const [pending, setPending] = useState<{
    prompt: string;
    url: string;
    mediaType: string;
    kind: "image" | "pdf";
    filename: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice input (microphone → transcription)
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micErr, setMicErr] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const stopMicStream = () => {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  };

  const startRecording = async () => {
    setMicErr(null);
    if (recording || transcribing) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicErr("Microphone not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      // Pick a mime the browser supports (Safari → mp4, others → webm)
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      let mime = "";
      for (const c of candidates) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) { mime = c; break; }
      }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopMicStream();
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        audioChunksRef.current = [];
        if (blob.size < 1024) {
          setMicErr("Recording too short — please try again.");
          setTranscribing(false);
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          const ext = type.includes("mp4") ? "mp4" : type.includes("mpeg") ? "mp3" : "webm";
          fd.append("file", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(errText || `Transcription failed (${res.status})`);
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) {
            setInput((prev) => (prev ? prev.replace(/\s+$/, "") + " " + text : text));
            requestAnimationFrame(() => textareaRef.current?.focus());
          } else {
            setMicErr("No speech detected. Please try again.");
          }
        } catch (err) {
          setMicErr(err instanceof Error ? err.message : String(err));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      stopMicStream();
      setMicErr(err instanceof Error ? err.message : "Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* ignore */ }
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

  useEffect(() => () => { stopMicStream(); }, []);


  const onMsgRef = useRef(onMessagesChange);
  const lastSyncedMessagesRef = useRef("");
  const syncTimerRef = useRef<number | null>(null);
  const pendingSyncRef = useRef<UIMessage[] | null>(null);
  useEffect(() => { onMsgRef.current = onMessagesChange; });
  useEffect(() => {
    const signature = messagesSignature(messages);
    pendingSyncRef.current = messages;

    if (status !== "ready" && status !== "error") return;
    if (signature === lastSyncedMessagesRef.current) return;
    lastSyncedMessagesRef.current = signature;

    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      const next = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (next) onMsgRef.current(next);
    }, 0);

    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [messages, status]);

  useEffect(() => () => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    const next = pendingSyncRef.current;
    if (next) onMsgRef.current(next);
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status, imgBusy, pending]);
  useEffect(() => { textareaRef.current?.focus(); }, [threadId, status]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt === "string") setInput(prompt);
      textareaRef.current?.focus();
    };
    window.addEventListener("noway:suggest", handler);
    return () => window.removeEventListener("noway:suggest", handler);
  }, []);

  const busy = status === "submitted" || status === "streaming" || imgBusy;

  const generateImage = async (prompt: string, imgModel: string = model) => {
    setImgBusy(true);
    setImgErr(null);
    if (pending?.url.startsWith("blob:")) URL.revokeObjectURL(pending.url);
    setPending(null);

    // Push the user's message into chat immediately
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
    };
    setMessages((prev) => [...prev, userMsg]);

    setPdfStatus("Analyzing your request…");
    const t1 = setTimeout(() => setPdfStatus("Composing your image…"), 900);
    const t2 = setTimeout(() => setPdfStatus("Rendering final pixels…"), 2600);

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: imgModel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { b64_json, mediaType } = (await res.json()) as { b64_json: string; mediaType: string };
      const bin = atob(b64_json);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mediaType || "image/png" });
      const url = URL.createObjectURL(blob);
      const asstMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [
          { type: "text", text: `Here is your image. You can download or regenerate as needed.` },
          { type: "file", mediaType: mediaType || "image/png", url, filename: "generated.png" },
        ],
      };
      setMessages((prev) => [...prev, asstMsg]);
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setPdfStatus(null);
      setImgBusy(false);
    }
  };

  const generatePdf = async (prompt: string, font?: string) => {
    setImgBusy(true);
    setImgErr(null);
    if (pending?.url.startsWith("blob:")) URL.revokeObjectURL(pending.url);
    setPending(null);

    // Push the user's message into chat immediately (ChatGPT/Gemini style)
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
    };
    setMessages((prev) => [...prev, userMsg]);

    setPdfStatus("Analyzing your request…");
    const t1 = setTimeout(() => setPdfStatus("Drafting your document…"), 900);
    const t2 = setTimeout(() => setPdfStatus("Formatting and rendering the PDF…"), 2600);

    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model, font }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { b64_pdf, mediaType, filename } = (await res.json()) as { b64_pdf: string; mediaType: string; filename: string };
      const bin = atob(b64_pdf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mediaType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const asstMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [
          { type: "text", text: `Here is your document — **${filename || "document.pdf"}**. Preview it below or download the PDF.` },
          { type: "file", mediaType: mediaType || "application/pdf", url, filename: filename || "document.pdf" },
        ],
      };
      setMessages((prev) => [...prev, asstMsg]);
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setPdfStatus(null);
      setImgBusy(false);
    }
  };

  const confirmPending = () => {
    if (!pending) return;
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: pending.prompt }],
    };
    const asstMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "file", mediaType: pending.mediaType, url: pending.url, filename: pending.filename }],
    };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setPending(null);
  };

  const discardPending = () => {
    if (pending?.url.startsWith("blob:")) URL.revokeObjectURL(pending.url);
    setPending(null);
  };

  const regeneratePending = () => {
    if (!pending) return;
    const p = pending.prompt;
    if (pending.kind === "pdf") {
      void generatePdf(p, extractFont(p));
    } else {
      void generateImage(p, isImageModel(model) ? model : "google/gemini-3-pro-image");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || (!input.trim() && !attached)) return;
    const prompt = input.trim();
    if (looksLikePdfRequest(prompt)) {
      if (!prompt) return;
      setInput("");
      setAttached(null);
      void generatePdf(prompt, extractFont(prompt));
      return;
    }
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

  const canSend = !!input.trim() || !!attached;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="pt-6 sm:pt-10 pb-4 animate-in fade-in duration-700">
              <div className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-semibold text-muted-foreground">
                Good evening, <span className="text-mint">@{username}</span>
              </div>
              <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] text-foreground">
                How can I help you today?
              </h1>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
                Ask anything, get intelligent answers, create content, analyze data, generate images, and much more.
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => onSuggestion(s.prompt)}
                      className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-border/70 bg-card/40 hover:bg-mint/10 hover:border-mint/40 text-sm text-foreground transition"
                    >
                      <Icon className="w-3.5 h-3.5 text-mint" />
                      {s.title}
                    </button>
                  );
                })}
              </div>

              <div className="mt-10 rounded-2xl border border-mint/20 bg-background/40 p-4">
                <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-3">
                  Your AI Assistant Stats
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Chats", value: "247", icon: Sparkles },
                    { label: "Time Saved", value: "128h", icon: Zap },
                    { label: "Accuracy", value: "98%", icon: Lightbulb },
                    { label: "Projects", value: "12", icon: FileTextIcon },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="rounded-xl bg-card/40 border border-border/60 p-3">
                        <div className="flex items-center gap-2 text-mint">
                          <Icon className="w-4 h-4" />
                          <div className="text-xl font-bold text-foreground">{s.value}</div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{s.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
          {(status === "submitted" || imgBusy) && (
            <div className="flex items-start gap-3">
              <AiAvatar />
              <div className="text-sm text-muted-foreground animate-pulse pt-1.5">
                {pdfStatus ?? (imgBusy ? "Generating…" : "Thinking…")}
              </div>
            </div>
          )}
          {(error || imgErr) && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              {error?.message ?? imgErr}
              {error && retryCountRef.current > 0 && retryCountRef.current <= 2 && (
                <div className="mt-1 text-muted-foreground">Auto-retrying… (attempt {retryCountRef.current}/2)</div>
              )}
            </div>
          )}
          {pending && (
            <div className="rounded-2xl border border-mint/40 bg-mint/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] tracking-widest uppercase text-mint">
                  {pending.kind === "pdf" ? "PDF Preview — confirm karo" : "Preview — confirm karo"}
                </div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[60%]" title={pending.prompt}>{pending.prompt}</div>
              </div>
              {pending.kind === "pdf" ? (
                <iframe src={pending.url} title="pdf-preview" className="w-full h-[70vh] rounded-xl border border-border bg-white" />
              ) : (
                <img src={pending.url} alt="preview" className="rounded-xl max-w-full max-h-[60vh] border border-border mx-auto block" />
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <a href={pending.url} download={pending.filename} className="text-[11px] px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-foreground">⬇ Download</a>
                <button type="button" onClick={regeneratePending} disabled={imgBusy} className="text-[11px] px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-foreground disabled:opacity-40">↻ Regenerate</button>
                <button type="button" onClick={discardPending} className="text-[11px] px-3 py-1.5 rounded-md bg-muted hover:bg-destructive/20 text-foreground">✕ Discard</button>
                <button type="button" onClick={confirmPending} className="text-[11px] px-3 py-1.5 rounded-md bg-gradient-to-r from-mint to-mint-glow text-black font-semibold">Send to chat ↑</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating pill composer */}
      <form onSubmit={submit} className="px-4 sm:px-6 pb-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="max-w-3xl mx-auto relative group">
          {/* aurora glow ring */}
          <div className="pointer-events-none absolute -inset-[2px] rounded-[32px] bg-[linear-gradient(120deg,var(--mint),var(--iris),var(--violet))] opacity-0 group-focus-within:opacity-60 blur-xl transition-opacity duration-500" />
          {attached && (
            <div className="mb-2 relative flex items-center gap-2 px-3 py-2 rounded-xl bg-muted text-xs text-foreground max-w-fit mx-auto shadow-sm">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="truncate max-w-[200px]">{attached.name}</span>
              <button type="button" onClick={() => setAttached(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="relative flex items-end gap-1.5 rounded-[28px] border border-border bg-card/80 backdrop-blur-2xl px-2 py-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] focus-within:border-mint/40 transition-colors overflow-hidden">
            <label className="cursor-pointer w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background/60 transition shrink-0" title="Attach image">
              <Paperclip className="w-5 h-5" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={transcribing}
              className={`flex w-10 h-10 items-center justify-center rounded-full transition shrink-0 ${
                recording
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : transcribing
                  ? "text-mint"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
              title={recording ? "Stop recording" : transcribing ? "Transcribing…" : micErr ?? "Voice input"}
              aria-label="Voice input"
              aria-pressed={recording}
            >
              <Mic className="w-5 h-5" />
            </button>
            <div className="flex flex-1 min-w-0 items-end gap-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
                placeholder="Message NOWAYxAQEEL…"
                rows={1}
                className="flex-1 min-w-0 w-full bg-transparent border-0 resize-none outline-none focus:outline-none focus:ring-0 text-[15px] text-foreground placeholder:text-muted-foreground max-h-48 py-2.5 px-2 leading-relaxed"
              />
            </div>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition shrink-0"
                title="Stop"
                aria-label="Stop"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={`w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-all duration-200 ${
                  canSend
                    ? "bg-gradient-to-br from-mint to-mint-glow text-black shadow-md hover:shadow-lg hover:brightness-110 scale-100"
                    : "bg-muted text-muted-foreground scale-95"
                }`}
                aria-label="Send"
                title="Send"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="mt-2 text-center text-[10px] text-muted-foreground">
            NOWAYxAQEEL GPT can make mistakes. Verify important info.
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
  const [pairs, setPairs] = useState<{ user: string; a: string; b: string; aErr?: string; bErr?: string }[]>(() => {
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
  const lastSyncedMessagesRef = useRef("");
  useEffect(() => { onMsgRef.current = onMessagesChange; });
  useEffect(() => {
    const merged: UIMessage[] = pairs.flatMap((p, i) => [
      { id: `u${i}`, role: "user" as const, parts: [{ type: "text" as const, text: p.user }] },
      { id: `a${i}`, role: "assistant" as const, parts: [{ type: "text" as const, text: `${p.a}\n---COMPARE---\n${p.b}` }] },
    ]);
    const signature = messagesSignature(merged);
    if (signature === lastSyncedMessagesRef.current) return;
    lastSyncedMessagesRef.current = signature;
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
      { role: "assistant", content: p.a },
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {pairs.length === 0 && (
            <div className="text-center py-24 text-muted-foreground text-sm">
              Compare mode — same prompt do models ko jayega, jawab side-by-side.
            </div>
          )}
          {pairs.map((p, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-2xl px-4 py-2.5 rounded-2xl bg-muted text-foreground text-sm">
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
      <form onSubmit={submit} className="px-4 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-6xl mx-auto flex items-end gap-2 rounded-[28px] border border-border bg-muted/60 backdrop-blur-xl px-2 py-2 shadow-lg focus-within:border-ring/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
            placeholder="Prompt for both models…"
            rows={1}
            className="flex-1 min-w-0 w-full bg-transparent border-0 resize-none outline-none focus:outline-none focus:ring-0 text-[15px] text-foreground placeholder:text-muted-foreground max-h-48 py-2.5 px-3"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={`w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-all ${
              input.trim() && !loading
                ? "bg-gradient-to-br from-mint to-mint-glow text-black shadow-md hover:brightness-110"
                : "bg-muted text-muted-foreground"
            }`}
            aria-label="Send"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </form>
    </>
  );
}

function ComparePanel({ label, text, error, loading }: { label: string; text: string; error?: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">{label}</div>
      {loading && <div className="text-xs text-muted-foreground animate-pulse">Thinking…</div>}
      {error && <div className="text-xs text-destructive">{error}</div>}
      {text && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
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
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-2xl space-y-2">
          {fileParts.map((f, i) => (
            f.mediaType.startsWith("image/") ? (
              <img key={i} src={f.url} alt={f.filename ?? "attachment"} className="rounded-2xl max-h-64 ml-auto block border border-border" />
            ) : (
              <div key={i} className="text-xs text-muted-foreground ml-auto">📎 {f.filename}</div>
            )
          ))}
          {text && (
            <div className="px-4 py-2.5 rounded-2xl bg-muted text-foreground text-[15px] whitespace-pre-wrap leading-relaxed">
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <AiAvatar />
      <div className="flex-1 min-w-0 space-y-3 pt-0.5">
        {fileParts.map((f, i) => (
          f.mediaType.startsWith("image/") ? (
            <div key={i} className="space-y-2">
              <img src={f.url} alt={f.filename ?? "generated"} className="rounded-2xl max-w-full max-h-[70vh] border border-border" />
              <a href={f.url} download={f.filename ?? "image.png"} className="inline-block text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-accent text-foreground">
                ⬇ Download PNG
              </a>
            </div>
          ) : f.mediaType === "application/pdf" ? (
            <div key={i} className="space-y-2">
              <iframe src={f.url} title={f.filename ?? "pdf"} className="w-full h-[60vh] rounded-2xl border border-border bg-white" />
              <a href={f.url} download={f.filename ?? "document.pdf"} className="inline-block text-[11px] px-2.5 py-1 rounded-md bg-muted hover:bg-accent text-foreground">
                ⬇ Download PDF · {f.filename}
              </a>
            </div>
          ) : (
            <div key={i} className="text-xs text-muted-foreground">📎 {f.filename}</div>
          )
        ))}
        {text && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed prose-p:my-2 prose-pre:rounded-xl prose-pre:bg-muted prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {text && text.trim().length > 40 && <ExportToGoogleDocsButton markdown={text} />}
      </div>
    </div>
  );
}

function ExportToGoogleDocsButton({ markdown }: { markdown: string }) {
  const exportFn = useServerFn(exportToGoogleDocs);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [url, setUrl] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const onClick = async () => {
    setState("loading");
    setErr("");
    try {
      const res = await exportFn({ data: { markdown } });
      setUrl(res.url);
      setState("done");
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Export failed.");
      setState("error");
    }
  };

  if (state === "done" && url) {
    return (
      <div className="rounded-xl border border-mint/30 bg-mint/5 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
        <Check className="w-4 h-4 text-mint shrink-0" />
        <span className="text-foreground">Your research document is ready.</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-mint hover:underline font-medium"
        >
          Click here to view and download as PDF
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md bg-muted hover:bg-accent text-foreground border border-border transition disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        {state === "loading" ? "Exporting…" : "Export to Google Docs"}
      </button>
      {state === "error" && <span className="text-[11px] text-destructive">{err}</span>}
    </div>
  );
}

