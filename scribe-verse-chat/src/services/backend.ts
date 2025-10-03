// src/services/backend.ts
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/* ---------------------------------- helpers --------------------------------- */

const API =
  import.meta.env.VITE_OFFLINE_API?.replace(/\/$/, "") || "http://localhost:5001";

function authHeader() {
  const tok = localStorage.getItem("offline_token") || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

async function api<T = any>(
  path: string,
  opts: RequestInit & { query?: Record<string, string | number | boolean> } = {}
): Promise<T> {
  const url = new URL(API + path);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString(), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  }
  return data as T;
}

function toCreditsRow(row: any): Credits {
  // Accept many shapes and always return a safe number
  if (row && typeof row === "object") {
    if (typeof row.remaining === "number") return { remaining: row.remaining };
    if (typeof row.credits === "number") return { remaining: row.credits };
    if (row.credits && typeof row.credits.remaining === "number") {
      return { remaining: row.credits.remaining };
    }
    // Supabase/other shapes could be nested under data
    if (row.data && typeof row.data === "object") return toCreditsRow(row.data);
  }
  const n = Number(row);
  return { remaining: Number.isFinite(n) ? n : 0 };
}

/* ------------------------------------ API ----------------------------------- */

export default {
  async getCredits(): Promise<Credits> {
    // Flask RPC returns: { data: { credits: { remaining: number } } }
    const r = await api<{ data?: { credits?: any } }>("/rpc/get_credits", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return toCreditsRow(r?.data?.credits ?? 0);
  },

  async listChats(limit = 1000, offset = 0): Promise<Chat[]> {
    const r = await api<{ rows: Chat[] }>("/db/chats", {
      method: "GET",
      query: {
        _order_col: "updated_at",
        _order_asc: 0,
        _offset: offset,
        _limit: limit,
      },
    });
    return r.rows || [];
  },

  async createChat(title: string): Promise<Chat> {
    const r = await api<{ rows: Chat[] }>("/db/chats", {
      method: "POST",
      body: JSON.stringify({ values: { title: title || "New Chat" } }),
    });
    return (r.rows && r.rows[0]) as Chat;
  },

  async renameChat(id: string, title: string): Promise<void> {
    await api<{ rows: Chat[] }>("/db/chats", {
      method: "PATCH",
      body: JSON.stringify({
        filters: { id },
        values: { title: title || "New Chat" },
      }),
    });
  },

  async deleteChat(id: string): Promise<void> {
    await api<{ rows: Chat[] }>("/db/chats", {
      method: "DELETE",
      query: { id },
    });
  },

  async listMessages(chatId: string, limit = 200, offset = 0): Promise<Message[]> {
    const r = await api<{ rows: Message[] }>("/db/messages", {
      method: "GET",
      query: {
        chat_id: chatId,
        _order_col: "created_at",
        _order_asc: 1,
        _offset: offset,
        _limit: limit,
      },
    });
    return r.rows || [];
  },

  async sendMessage(params: { chatId: string; version: BotVersion; text: string }) {
    const r = await api<any>("/functions/v1/chat-router", {
      method: "POST",
      body: JSON.stringify({
        chat_id: params.chatId,
        version: params.version,
        text: params.text,
      }),
    });

    // If the backend blocked due to credits, it returns:
    // { error: "insufficient_credits", data: { credits: { remaining } } }
    if ((r as any)?.error === "insufficient_credits") {
      return { errorCode: "INSUFFICIENT_CREDITS", credits: toCreditsRow(r?.data?.credits) };
    }

    const replyText =
      r?.data?.choices?.[0]?.message?.content ??
      r?.choices?.[0]?.message?.content ??
      `Temporary reply message from ${params.version}`;

    const credits = toCreditsRow(r?.data?.credits ?? r?.credits);

    const assistant: Message = {
      id: `asst-${Date.now()}`,
      chat_id: params.chatId,
      user_id: null as any,
      role: "assistant",
      content: { text: replyText, version: params.version, meta: {} } as any,
      created_at: new Date().toISOString(),
    };
    return { assistant, credits };
  },

  async regenerate(params: { chatId: string; version: BotVersion; lastUserText: string }) {
    return this.sendMessage({
      chatId: params.chatId,
      version: params.version,
      text: params.lastUserText,
    });
  },

  async login(email: string, password: string) {
    const r = await api<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("offline_token", r.token);
    return r;
  },

  // register now supports BOTH signatures:
  //   register("Name", "email@x.com", "pass")
  //   register({ name: "Name", email: "email@x.com", password: "pass" })
  async register(
    arg1: string | { name: string; email: string; password: string },
    email?: string,
    password?: string
  ) {
    const payload =
      typeof arg1 === "string"
        ? { name: arg1, email: String(email || ""), password: String(password || "") }
        : arg1;

    const r = await api<{ session?: { access_token: string }; user: any }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const tok = r.session?.access_token;
    if (tok) localStorage.setItem("offline_token", tok);
    return r;
  },

  async signOut() {
    try {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {
      // ignore
    }
    localStorage.removeItem("offline_token");
  },
};
