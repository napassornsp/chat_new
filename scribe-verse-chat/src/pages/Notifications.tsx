import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type NotificationItem = {
  id: string | number;
  title: string;
  body: string;
  unread: boolean;
  created_at?: string;
  kind?: "system" | "billing" | "promo" | "limit" | "general";
};

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
const PAGE_SIZE = 20;

function authHeaders() {
  const token = localStorage.getItem("offline_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export default function Notifications() {
  const canonical =
    typeof window !== "undefined" ? `${window.location.origin}/notifications` : "";

  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<NotificationItem | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => items.filter((i) => i.unread).length,
    [items]
  );

  async function fetchNotifications({ reset }: { reset?: boolean } = {}) {
    if (reset) {
      setOffset(0);
      setHasMore(true);
      setItems([]);
    }
    setError(null);
    const q = new URLSearchParams({
      status: filter,
      limit: String(PAGE_SIZE),
      offset: reset ? "0" : String(offset),
    }).toString();

    const url = `${API}/notifications?${q}`;
    const isFirst = reset || offset === 0;

    try {
      if (isFirst) setLoading(true);
      else setLoadingMore(true);

      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      // support either {rows: [...]} or bare array
      const rows: NotificationItem[] = (j?.rows ?? j ?? []) as NotificationItem[];
      if (!Array.isArray(rows)) throw new Error("Invalid payload");

      setItems((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMore(rows.length >= PAGE_SIZE);
      setOffset((prev) => (reset ? rows.length : prev + rows.length));
    } catch (e: any) {
      setError(e?.message || "Failed to load notifications.");
      // IMPORTANT: no fallback data here — backend only.
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function markRead(id: string | number) {
    try {
      await fetch(`${API}/notifications/mark_read`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore network errors; keep UI optimistic
    } finally {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
      );
    }
  }

  useEffect(() => {
    fetchNotifications({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openMessage = (n: NotificationItem) => {
    setActive(n);
    setOpen(true);
    if (n.unread) markRead(n.id);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchNotifications();
  };

  return (
    <main className="container py-6 h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>{`Notifications${unreadCount ? ` (${unreadCount})` : ""} | JV System`}</title>
        <meta name="description" content="System messages about billing, limits, and updates." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <Badge className="rounded-full">{unreadCount} unread</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterPill label="Unread" active={filter === "unread"} onClick={() => setFilter("unread")} count={unreadCount} />
          <FilterPill label="Read" active={filter === "read"} onClick={() => setFilter("read")} />
        </div>
      </div>

      {/* Scrollable list */}
      <div ref={listRef} className="h-[calc(100vh-180px)] min-h-[360px] overflow-y-auto pr-1">
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl border bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-destructive mb-3">{error}</div>
            <Button variant="outline" size="sm" onClick={() => fetchNotifications({ reset: true })}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="text-sm text-muted-foreground">No notifications.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-4">
            {items.map((n) => (
              <Card
                key={n.id}
                className={["cursor-pointer transition hover:shadow-md", n.unread ? "border-primary/50" : ""].join(" ")}
                onClick={() => openMessage(n)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="truncate">{n.title}</span>
                    {n.unread && <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden title="Unread" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div className="line-clamp-2">{n.body}</div>
                  {n.created_at && (
                    <div className="mt-2 text-xs text-muted-foreground/80">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {hasMore && (
              <div className="flex justify-center py-2">
                <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full-message dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">{active?.title ?? "Message"}</DialogTitle>
            {active?.created_at && (
              <DialogDescription className="text-xs">
                {new Date(active.created_at).toLocaleString()}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{active?.body}</div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs transition",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
      ].join(" ")}
      aria-pressed={active}
    >
      {label}
      {typeof count === "number" && count > 0 ? ` (${count})` : ""}
    </button>
  );
}
