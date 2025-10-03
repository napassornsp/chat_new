import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, FileText, Pencil, Trash2, CheckCircle2, Search } from "lucide-react";
import service from "@/services/backend";

type OcrType = "bill" | "bank";

type Item = {
  id: string;
  type: OcrType;
  filename: string | null;
  file_url: string | null;
  data: any;
  approved?: boolean;
  created_at: string;
};

type Props = {
  type: OcrType;
  onOpen?: (item: Item) => void; // optional: we also broadcast a global event
};

export default function OCRHistory({ type, onOpen }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await service.listOcr(type, 50, 0);
      setItems(rows as Item[]);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  // Allow other components to request refresh
  useEffect(() => {
    const listener = () => load();
    window.addEventListener("ocr:refresh", listener as any);
    return () => window.removeEventListener("ocr:refresh", listener as any);
  }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const name = (it.filename || "").toLowerCase();
      const id = String(it.id);
      return name.includes(needle) || id.includes(needle);
    });
  }, [items, q]);

  const openItem = (it: Item) => {
    onOpen?.(it);
    window.dispatchEvent(new CustomEvent("ocr:open", { detail: { type, id: it.id } }));
  };

  const doRename = async (it: Item) => {
    const current = it.filename || "";
    const name = window.prompt("Rename file", current);
    if (name == null) return;
    const val = name.trim();
    if (!val || val === current) return;
    try {
      await service.updateOcr(type, it.id, { filename: val });
      await load();
    } catch (e) {
      console.error(e);
      alert("Rename failed");
    }
  };

  const doDelete = async (it: Item) => {
    if (!window.confirm(`Delete "${it.filename || it.id}"?`)) return;
    try {
      await service.deleteOcr(type, it.id);
      await load();
    } catch (e) {
      console.error(e);
      alert("Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">OCR History</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 opacity-60" />
            <Input
              className="pl-8 h-9 w-48"
              placeholder="Search name / id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {loading ? "Loading..." : "No history found."}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {filtered.map((it) => (
              <div
                key={`${it.type}-${it.id}`}
                className="flex items-center gap-2 px-3 py-2 border-b last:border-none hover:bg-muted/40"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {it.filename || (it.type === "bill" ? "Bill" : "Bank")}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {new Date(it.created_at).toLocaleString()}
                  </div>
                </div>
                {it.approved ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Approved" />
                ) : null}
                <Badge variant="outline" className="capitalize">{it.type}</Badge>
                <Button size="sm" variant="secondary" onClick={() => openItem(it)}>Open</Button>
                <Button size="icon" variant="ghost" onClick={() => doRename(it)} title="Rename">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => doDelete(it)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
