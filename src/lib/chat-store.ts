import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

export type StoredThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

function textOf(m: UIMessage): string {
  return (m.parts ?? []).map((p: any) => (p?.type === "text" ? p.text : "")).join("");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hash32(input: string, seed: number): string {
  let h = seed ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x45d9f3b);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, "0");
}

function dbMessageId(id: string): string {
  if (UUID_RE.test(id)) return id;
  const raw = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => hash32(id, seed))
    .join("");
  const variant = ((Number.parseInt(raw.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-${variant}${raw.slice(18, 20)}-${raw.slice(20, 32)}`;
}

export async function fetchAllThreadsWithMessages(userId: string): Promise<StoredThread[]> {
  const { data: threads, error: tErr } = await supabase
    .from("chat_threads")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (tErr) throw tErr;
  if (!threads || threads.length === 0) return [];

  const ids = threads.map((t) => t.id);
  const { data: msgs, error: mErr } = await supabase
    .from("chat_messages")
    .select("id, thread_id, role, parts, created_at")
    .in("thread_id", ids)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  const grouped: Record<string, UIMessage[]> = {};
  for (const m of msgs ?? []) {
    (grouped[m.thread_id] ||= []).push({
      id: m.id,
      role: m.role as UIMessage["role"],
      parts: m.parts as UIMessage["parts"],
    } as UIMessage);
  }
  return threads.map((t) => ({
    id: t.id,
    title: t.title ?? "New chat",
    updatedAt: new Date(t.updated_at).getTime(),
    messages: grouped[t.id] ?? [],
  }));
}

export async function createThreadDb(userId: string, threadId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_threads")
    .insert({ id: threadId, user_id: userId, title: "New chat" });
  if (error) throw error;
}

export async function deleteThreadDb(threadId: string): Promise<void> {
  const { error } = await supabase.from("chat_threads").delete().eq("id", threadId);
  if (error) throw error;
}

export async function persistMessagesDb(
  threadId: string,
  userId: string,
  messages: UIMessage[],
  prevTitle: string,
): Promise<{ title: string }> {
  // Upsert messages by id (client-generated UUIDs)
  if (messages.length) {
    const rows = messages.map((m) => ({
      id: dbMessageId(m.id),
      thread_id: threadId,
      user_id: userId,
      role: m.role,
      parts: m.parts as any,
    }));
    const { error } = await supabase
      .from("chat_messages")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  // Update title from first user message if still default
  let title = prevTitle;
  if (prevTitle === "New chat") {
    const firstUser = messages.find((m) => m.role === "user");
    const derived = firstUser ? textOf(firstUser).slice(0, 60).trim() : "";
    if (derived) title = derived;
  }
  const { error: uErr } = await supabase
    .from("chat_threads")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", threadId);
  if (uErr) throw uErr;
  return { title };
}
