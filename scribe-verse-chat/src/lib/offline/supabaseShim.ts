import { io, Socket } from "socket.io-client";

type Order = { column: string; ascending: boolean };
type SelectQuery = {
  filters: Record<string, string>;
  order?: Order;
  limit?: number;
  offset?: number;
  single?: boolean;
};

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
const WS_ORIGIN = import.meta.env.VITE_OFFLINE_WS_ORIGIN || "http://localhost:5001";

function authHeader() {
  const t = localStorage.getItem("offline_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function getJSON(url: string, params: Record<string, any> = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) sp.set(k, String(v)); });
  const res = await fetch(`${API}${url}?${sp.toString()}`, { headers: { ...authHeader() } });
  return res.json();
}
async function postJSON(url: string, body: any = {}) {
  const res = await fetch(`${API}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function patchJSON(url: string, body: any = {}) {
  const res = await fetch(`${API}${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function deleteJSON(url: string, params: Record<string, any> = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) sp.set(k, String(v)); });
  const res = await fetch(`${API}${url}?${sp.toString()}`, { method: "DELETE", headers: { ...authHeader() } });
  return res.json();
}

// auth event bus
type Handler = (payload: any) => void;
const listeners = new Set<Handler>();
function emitAuth(event: string, session: any) {
  listeners.forEach((fn) => fn({ event, session }));
}

export function createClient(_url?: string, _key?: string) {
  // --- auth ---
  const auth = {
    async getUser() {
      const data = await getJSON("/auth/me");
      return { data: { user: data.user }, error: null };
    },
    async getSession() {
      const token = localStorage.getItem("offline_token") || null;
      const me = await getJSON("/auth/me").catch(() => ({ user: null }));
      const user = me?.user ?? null;
      const session = token && user ? { access_token: token, user } : null;
      return { data: { session }, error: null };
    },
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { name?: string } } }) {
      const name = options?.data?.name;
      const data = await postJSON("/auth/signup", { email, password, name });
      if (data?.session?.access_token && data?.user) {
        localStorage.setItem("offline_token", data.session.access_token);
        emitAuth("SIGNED_IN", { user: data.user, access_token: data.session.access_token });
        return { data: { user: data.user, session: data.session }, error: null };
      }
      return { data: null, error: data?.error || "signup_failed" };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const data = await postJSON("/auth/login", { email, password });
      if (data?.token) {
        localStorage.setItem("offline_token", data.token);
        const session = { access_token: data.token, user: data.user };
        emitAuth("SIGNED_IN", session);
        return { data: { user: data.user, session }, error: null };
      }
      return { data: null, error: data?.error || "login_failed" };
    },
    async signOut() {
      await postJSON("/auth/logout", {});
      localStorage.removeItem("offline_token");
      emitAuth("SIGNED_OUT", null);
      return { error: null };
    },
    onAuthStateChange(cb: (event: string, session: any) => void) {
      const handler: Handler = ({ event, session }) => cb(event, session);
      listeners.add(handler);
      return { data: { subscription: { unsubscribe: () => listeners.delete(handler) } }, error: null };
    },
  };

  // --- rpc ---
  async function rpc(fn: string, args?: any) {
    const data = await postJSON(`/rpc/${fn}`, args || {});
    if (data?.error) return { data: null, error: data.error };
    return { data: data.data ?? data, error: null };
  }

  // --- functions.invoke ---
  const functions = {
    async invoke(name: string, options?: { body?: any; headers?: Record<string, string> }) {
      const body = options?.body ?? {};
      const res = await postJSON(`/functions/v1/${name}`, body);
      if (res?.error) return { data: null, error: res.error, raw: res };
      return { data: res.data ?? res, error: null };
    },
  };

  // --- table ops ---
  function from(table: string) {
    const q: SelectQuery = { filters: {} };

    const selectApi: any = {
      eq(col: string, val: any) { q.filters[col] = String(val); return selectApi; },
      order(col: string, opts?: { ascending?: boolean }) { q.order = { column: col, ascending: opts?.ascending ?? true }; return selectApi; },
      limit(n: number) { q.limit = Number(n) || 0; return selectApi; },
      range(from: number, to: number) { const f = Math.max(0, Number(from) || 0); const t = Math.max(f, Number(to) || f); q.offset = f; q.limit = t - f + 1; return selectApi; },
      single() { q.single = true; return selectApi; },
      async then(resolve: any, reject?: any) {
        try {
          const params: any = { ...q.filters };
          if (q.order) { params._order_col = q.order.column; params._order_asc = q.order.ascending ? "1" : "0"; }
          if (q.offset != null) params._offset = String(q.offset);
          if (q.limit != null) params._limit = String(q.limit);
          const res = await getJSON(`/db/${table}`, params);
          const rows = Array.isArray(res?.rows) ? res.rows : [];
          resolve({ data: q.single ? (rows[0] ?? null) : rows, error: null });
        } catch (e) { if (reject) reject(e); else throw e; }
      },
    };

    return {
      select: () => selectApi,

      insert(values: any | any[]) {
        let wantSingle = false;
        return {
          select() { return this; },
          single() { wantSingle = true; return this; },
          async then(resolve: any, reject?: any) {
            try {
              const res = await postJSON(`/db/${table}`, { values });
              const rows = Array.isArray(res?.rows) ? res.rows : [];
              resolve({ data: wantSingle ? (rows[0] ?? null) : rows, error: null });
            } catch (e) { if (reject) reject(e); else throw e; }
          },
        };
      },

      update(values: any) {
        const filters: Record<string, any> = {};
        return {
          eq(col: string, val: any) { filters[col] = val; return this; },
          async then(resolve: any, reject?: any) {
            try {
              const res = await patchJSON(`/db/${table}`, { values, filters });
              resolve({ data: res.rows, error: null });
            } catch (e) { if (reject) reject(e); else throw e; }
          },
        };
      },

      delete() {
        const filters: Record<string, any> = {};
        return {
          eq(col: string, val: any) { filters[col] = val; return this; },
          async then(resolve: any, reject?: any) {
            try {
              const res = await deleteJSON(`/db/${table}`, filters);
              resolve({ data: res.rows, error: null });
            } catch (e) { if (reject) reject(e); else throw e; }
          },
        };
      },
    };
  }

  // --- realtime (db_change socket) ---
  function channel(_name: string) {
    const socket: Socket = io(WS_ORIGIN, { transports: ["websocket"] });
    const handlers: Array<(payload: any) => void> = [];
    socket.on("db_change", (data: any) => {
      handlers.forEach((h) => h({ event: "postgres_changes", payload: data }));
    });
    return {
      on(_evt: any, cb: (data: any) => void) { handlers.push(cb); return this; },
      subscribe() { return { data: { subscription: this }, error: null }; },
      unsubscribe() { socket.disconnect(); },
    };
  }

  return { auth, rpc, functions, from, channel };
}