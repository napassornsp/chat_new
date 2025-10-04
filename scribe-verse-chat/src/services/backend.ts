// src/services/backend.ts
import type { Chat, Message, Credits, BotVersion } from "./types";

/* ---------------------------------- helpers --------------------------------- */

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";

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

/** Normalize various backend shapes into { remaining: number } (chat credits only) */
function toCreditsRow(row: any): Credits {
  if (row && typeof row === "object") {
    if (typeof row.remaining === "number") return { remaining: row.remaining };
    if (typeof row.remaining_simple === "number") return { remaining: row.remaining_simple };
    if (row.chat && typeof row.chat.remaining === "number") {
      return { remaining: Number(row.chat.remaining) };
    }
    if (row.credits && typeof row.credits === "object") return toCreditsRow(row.credits);
    if (row.data && typeof row.data === "object") return toCreditsRow(row.data);
  }
  const n = Number(row);
  return { remaining: Number.isFinite(n) ? n : 0 };
}

/* --------------------------- Full credits (structured) ----------------------- */

export type CreditBucket = {
  limit: number;
  used: number;
  remaining: number;
  percent_used: number;
};

export type CreditsFull = {
  plan: string;
  last_reset_at: string | null;
  chat: CreditBucket;
  ocr_bill: CreditBucket;
  ocr_bank: CreditBucket;
};

function toCreditsFull(payload: any): CreditsFull {
  const safeBucket = (b: any): CreditBucket => ({
    limit: Number(b?.limit ?? 0),
    used: Number(b?.used ?? 0),
    remaining: Number(b?.remaining ?? 0),
    percent_used: Number(b?.percent_used ?? 0),
  });
  const p = payload?.data?.credits ?? payload?.credits ?? payload ?? {};
  return {
    plan: String(p?.plan ?? "free"),
    last_reset_at: p?.last_reset_at ?? null,
    chat: safeBucket(p?.chat),
    ocr_bill: safeBucket(p?.ocr_bill),
    ocr_bank: safeBucket(p?.ocr_bank),
  };
}

/* --------------------------------- Profile ---------------------------------- */
/** Minimal profile (no avatar for now) */
export type Profile = {
  email: string;
  display_name: string; // map backend name/username to this
  plan?: string;
};

function toProfile(payload: any): Profile {
  // Supports:
  // - GET /me -> user object directly (id, email, name, profile…)
  // - GET /auth/me -> { user: {...} }
  const p =
    payload?.user ??
    payload?.data?.profile ??
    payload?.profile ??
    payload?.data ??
    payload ??
    {};
  return {
    email: String(p?.email ?? ""),
    display_name: String(p?.display_name ?? p?.username ?? p?.name ?? ""),
    plan: p?.plan ? String(p.plan) : undefined,
  };
}

/** Robust profile fetch that matches app.py */
async function tryGetProfile(): Promise<Profile> {
  // 1) GET /me
  try {
    const r = await api<any>("/me", { method: "GET" });
    return toProfile(r);
  } catch {}

  // 2) GET /auth/me
  try {
    const r = await api<any>("/auth/me", { method: "GET" });
    return toProfile(r);
  } catch {}

  return { email: "", display_name: "" };
}

/** Profile update = PUT /me with { name } */
async function tryUpdateProfile(
  patch: Partial<Pick<Profile, "display_name">>
): Promise<Profile> {
  const payload = { name: patch.display_name };
  const r = await api<any>("/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return toProfile(r);
}

/** Password change with fallbacks (primary matches app.py) */
async function tryChangePassword(old_password: string, new_password: string): Promise<void> {
  // 1) /auth/change-password (exists in app.py)
  try {
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    });
    return;
  } catch {}

  // 2) /auth/password (fallback if you ever add it)
  try {
    await api("/auth/password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    });
    return;
  } catch {}

  // 3) RPC fallback (optional)
  await api("/rpc/change_password", {
    method: "POST",
    body: JSON.stringify({ old_password, new_password }),
  });
}

/* ------------------------------ OCR data types ------------------------------- */

type OcrType = "bill" | "bank";

export type OcrRow = {
  id: string;
  type: OcrType; // attached by client
  filename: string | null;
  file_url: string | null;
  data: any; // parsed OCR JSON
  approved?: boolean;
  created_at: string;
};

function tableOf(t: OcrType) {
  return t === "bill" ? "ocr_bill_extractions" : "ocr_bank_extractions";
}

/* ------------------------------------ API ----------------------------------- */

export default {
  /* ------------------------------- Credits / Chat ------------------------------ */

  /** Legacy/simple: returns { remaining } for CHAT credits (kept for compatibility) */
  async getCredits(): Promise<Credits> {
    const r = await api<{ data?: { credits?: any } }>("/rpc/get_credits", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return toCreditsRow(r?.data?.credits ?? 0);
  },

  /** New: returns full structured credits (plan, chat, ocr_bill, ocr_bank) */
  async getCreditsFull(): Promise<CreditsFull> {
    const r = await api<{ data?: { credits?: any } }>("/rpc/get_credits", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return toCreditsFull(r);
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

  async listMessages(
    chatId: string,
    limit = 200,
    offset = 0,
    extra?: { signal?: AbortSignal }
  ): Promise<Message[]> {
    const r = await api<{ rows: Message[] }>("/db/messages", {
      method: "GET",
      ...(extra?.signal ? { signal: extra.signal } : {}),
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

    // Backend returns 200 even for insufficient credits
    if (r?.errorCode === "INSUFFICIENT_CREDITS") {
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
    } catch {}
    localStorage.removeItem("offline_token");
  },

  /* -------------------------------- Profile -------------------------------- */

  /** Load profile (email, display_name, plan) */
  async getProfile(): Promise<Profile> {
    return tryGetProfile();
  },

  /** Update profile fields (display_name) and return updated Profile */
  async updateProfile(patch: Partial<Pick<Profile, "display_name">>): Promise<Profile> {
    return tryUpdateProfile(patch);
  },

  /** Change password by providing old and new password */
  async changePassword(old_password: string, new_password: string): Promise<void> {
    return tryChangePassword(old_password, new_password);
  },

  /** Optional: create an upgrade request so Sales can contact the user */
  async requestUpgrade(plan: string): Promise<void> {
    try {
      await api("/billing/upgrade-request", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
    } catch {
      // non-fatal
    }
  },

  /* ---------------------------------- OCR ---------------------------------- */

  async listOcr(t: OcrType, limit = 50, offset = 0): Promise<OcrRow[]> {
    const r = await api<{ rows: any[] }>(`/db/${tableOf(t)}`, {
      method: "GET",
      query: {
        _order_col: "created_at",
        _order_asc: 0,
        _offset: offset,
        _limit: limit,
      },
    });
    return (r.rows || []).map((row) => ({ ...row, type: t })) as OcrRow[];
  },

  async getOcr(t: OcrType, id: string): Promise<OcrRow | null> {
    const r = await api<{ rows: any[] }>(`/db/${tableOf(t)}`, {
      method: "GET",
      query: { id },
    });
    const row = (r.rows || [])[0];
    return row ? ({ ...row, type: t } as OcrRow) : null;
  },

  async createOcr(
    t: OcrType,
    values: Partial<Pick<OcrRow, "filename" | "file_url" | "data" | "approved">> & {
      created_at?: string;
    }
  ): Promise<OcrRow> {
    const r = await api<{ rows: any[] }>(`/db/${tableOf(t)}`, {
      method: "POST",
      body: JSON.stringify({ values }),
    });
    const row = (r.rows || [])[0];
    return { ...row, type: t } as OcrRow;
  },

  async updateOcr(
    t: OcrType,
    id: string,
    patch: Partial<Pick<OcrRow, "filename" | "file_url" | "data" | "approved">>
  ): Promise<void> {
    await api(`/db/${tableOf(t)}`, {
      method: "PATCH",
      body: JSON.stringify({ filters: { id }, values: patch }),
    });
  },

  async deleteOcr(t: OcrType, id: string): Promise<void> {
    await api(`/db/${tableOf(t)}`, {
      method: "DELETE",
      query: { id },
    });
  },
};
