import { supabase } from "@/integrations/supabase/client";
import type { BackendService, BotVersion, Chat, Credits, Message } from "./types";

function versionField(version: BotVersion): keyof Credits {
  return version === "V1" ? "v1" : version === "V2" ? "v2" : "v3";
}

const service: BackendService = {
  async signIn(email, password) {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  },
  async signUp(email, password) {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: error?.message };
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return { userId: data.session?.user?.id ?? null };
  },

  async getCredits(): Promise<Credits> {
    const { data, error } = await supabase.rpc('reset_monthly_credits');
    if (error || !data) return { v1: 0, v2: 0, v3: 0 };
    // Supabase RPC returns an array for set-returning functions; handle both cases
    const row = Array.isArray(data) ? data[0] : data;
    return { v1: row?.v1 ?? 0, v2: row?.v2 ?? 0, v3: row?.v3 ?? 0 } as Credits;
  },

  async createChat(title?: string): Promise<Chat> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: title ?? "New Chat" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return data as Chat;
  },

  async renameChat(chatId: string, title: string) {
    const { error } = await supabase
      .from("chats")
      .update({ title })
      .eq("id", chatId);
    if (error) throw error;
  },

  async deleteChat(chatId: string) {
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) throw error;
  },

  async listChats(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as Chat[];
  },

  async listMessages(chatId: string, limit = 100, offset = 0) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, chat_id, user_id, role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as unknown as Message[];
  },

  async sendMessage({ chatId, version, text }) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    // Optimistically insert the user message in DB as well
    const { error: insertErr } = await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: user.id,
      role: "user",
      content: { text, version, meta: {} },
    });
    if (insertErr) throw insertErr;

    const { data, error } = await supabase.functions.invoke("chat-router", {
      body: { action: "send", chatId, version, text },
    });
    if (error) throw error;
    return data as { assistant: Message; credits: Credits };
  },

  async regenerate({ chatId, version, lastUserText }) {
    const { data, error } = await supabase.functions.invoke("chat-router", {
      body: { action: "regenerate", chatId, version, lastUserText },
    });
    if (error) throw error;
    return data as { assistant: Message; credits: Credits };
  },
};

export default service;
