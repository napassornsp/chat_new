import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, MoreVertical, ZoomIn, ZoomOut, RefreshCw, FlipHorizontal, RotateCw, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Item {
  id: string;
  type: "bill" | "bank";
  filename: string | null;
  created_at: string;
  data: any;
  approved?: boolean;
  file_url?: string | null;
}

export default function OCRHistory() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/ocr/history" : "";
  const title = useMemo(() => "OCR History", []);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [billCredits, setBillCredits] = useState<number | null>(null);
  const [bankCredits, setBankCredits] = useState<number | null>(null);
  const [billMax, setBillMax] = useState<number | null>(null);
  const [bankMax, setBankMax] = useState<number | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  type ControlState = { file: File | null; preview: string | null; scale: number; flipped: boolean; rotation: number; processing: boolean };
  const [controls, setControls] = useState<Record<string, ControlState>>({});
  const { toast } = useToast();
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: bills }, { data: banks }] = await Promise.all([
        supabase.from("ocr_bill_extractions").select("id, filename, created_at, data, approved, file_url").order("created_at", { ascending: false }),
        supabase.from("ocr_bank_extractions").select("id, filename, created_at, data, approved, file_url").order("created_at", { ascending: false }),
      ]);

      const billItems: Item[] = (bills ?? []).map((b: any) => ({
        id: b.id,
        type: "bill",
        filename: b.filename ?? null,
        created_at: b.created_at,
        data: b.data,
        approved: !!b.approved,
        file_url: b.file_url ?? null,
      }));
      const bankItems: Item[] = (banks ?? []).map((b: any) => ({
        id: b.id,
        type: "bank",
        filename: b.filename ?? null,
        created_at: b.created_at,
        data: b.data,
        approved: !!b.approved,
        file_url: b.file_url ?? null,
      }));

      const combined = [...billItems, ...bankItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(combined);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const loadCredits = async () => {
      try {
        const { data, error } = await supabase.rpc('reset_monthly_ocr_credits');
        if (!error && Array.isArray(data) && data.length) {
          setBillCredits((data[0] as any)?.bill ?? null);
          setBankCredits((data[0] as any)?.bank ?? null);
        } else if (!error && data && (data as any).bill !== undefined) {
          setBillCredits((data as any).bill ?? null);
          setBankCredits((data as any).bank ?? null);
        } else {
          const { data: uc } = await supabase.from('user_credits').select('ocr_bill, ocr_bank').single();
          if (uc) {
            setBillCredits((uc as any).ocr_bill ?? null);
            setBankCredits((uc as any).ocr_bank ?? null);
          }
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: profile } = await supabase.from('profiles').select('plan_id').eq('id', uid).single();
          const planId = (profile as any)?.plan_id;
          if (planId) {
            const { data: plan } = await supabase.from('plans').select('ocr_bill_limit, ocr_bank_limit').eq('id', planId).single();
            setBillMax((plan as any)?.ocr_bill_limit ?? 12);
            setBankMax((plan as any)?.ocr_bank_limit ?? 13);
          } else {
            setBillMax(12);
            setBankMax(13);
          }
        }
      } catch (e) {
        console.error('Failed to load credits', e);
      }
    };
    loadCredits();
  }, []);

  const keyOf = (it: Item) => `${it.type}-${it.id}`;
  const getCtrl = (k: string): ControlState => controls[k] ?? { file: null, preview: null, scale: 1, flipped: false, rotation: 0, processing: false };
  const setCtrl = (k: string, patch: Partial<ControlState>) => setControls((s) => ({ ...s, [k]: { ...getCtrl(k), ...patch } }));
  const toggleExpand = (k: string) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  const onFileChange = (k: string, f: File | null) => {
    setCtrl(k, { file: f, preview: f ? URL.createObjectURL(f) : null });
  };
  const zoomInFor = (k: string) => {
    const c = getCtrl(k);
    setCtrl(k, { scale: Math.min(4, parseFloat((c.scale + 0.25).toFixed(2))) });
  };
  const zoomOutFor = (k: string) => {
    const c = getCtrl(k);
    setCtrl(k, { scale: Math.max(0.5, parseFloat((c.scale - 0.25).toFixed(2))) });
  };
  const flipFor = (k: string) => {
    const c = getCtrl(k);
    setCtrl(k, { flipped: !c.flipped });
  };
  const rotateFor = (k: string) => {
    const c = getCtrl(k);
    setCtrl(k, { rotation: (c.rotation + 90) % 360 });
  };
  const resetFor = (k: string) => {
    setCtrl(k, { scale: 1, flipped: false, rotation: 0, file: null, preview: null });
  };

  const approveRow = async (it: Item) => {
    const table = it.type === 'bill' ? 'ocr_bill_extractions' : 'ocr_bank_extractions';
    const { error } = await supabase.from(table).update({ approved: true }).eq('id', it.id);
    if (!error) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, approved: true } : p)));
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
      toast({ title: 'Approved', description: 'Marked as approved.' });
    } else {
      toast({ title: 'Error', description: 'Could not mark as approved.' });
    }
  };

  const saveRow = async (it: Item) => {
    const k = keyOf(it);
    const c = getCtrl(k);
    let payload: any = {};
    let filename: string | undefined;
    if (c.file) {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { toast({ title: 'Not logged in' }); return; }
      const path = `${uid}/${Date.now()}_${c.file.name}`;
      const { error: upErr } = await supabase.storage.from('ocr').upload(path, c.file);
      if (!upErr) {
        const { data: pub } = supabase.storage.from('ocr').getPublicUrl(path);
        payload.file_url = pub.publicUrl;
        filename = c.file.name;
      }
    }
    if (filename !== undefined) payload.filename = filename;
    if (Object.keys(payload).length === 0) {
      // Fallback to rename only
      const name = window.prompt('Rename file', it.filename || '');
      if (name === null) return;
      payload.filename = name;
    }
    const table = it.type === 'bill' ? 'ocr_bill_extractions' : 'ocr_bank_extractions';
    const { error } = await supabase.from(table).update(payload).eq('id', it.id);
    if (!error) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, ...payload } : p)));
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
      toast({ title: 'Saved', description: 'Item updated.' });
    } else {
      toast({ title: 'Save failed', description: 'Could not update item.' });
    }
  };

  const analyzeRow = async (it: Item) => {
    const k = keyOf(it);
    const c = getCtrl(k);
    const isBill = it.type === 'bill';
    const credits = isBill ? billCredits : bankCredits;
    if (credits !== null && credits <= 0) {
      toast({ title: 'Not enough credits', description: `You have no ${isBill ? 'Bill' : 'Bank'} credits left this month.` });
      return;
    }
    setCtrl(k, { processing: true });
    setTimeout(async () => {
      setCtrl(k, { processing: false });
      try {
        // Upload file if selected
        let payload: any = {};
        if (c.file) {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id;
          if (!uid) throw new Error('Not logged in');
          const path = `${uid}/${Date.now()}_${c.file.name}`;
          const { error: upErr } = await supabase.storage.from('ocr').upload(path, c.file);
          if (!upErr) {
            const { data: pub } = supabase.storage.from('ocr').getPublicUrl(path);
            payload.file_url = pub.publicUrl;
            payload.filename = c.file.name;
          }
        }
        if (Object.keys(payload).length > 0) {
          const table = isBill ? 'ocr_bill_extractions' : 'ocr_bank_extractions';
          const { error: upErr2 } = await supabase.from(table).update(payload).eq('id', it.id);
          if (!upErr2) {
            setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, ...payload } : p)));
            window.dispatchEvent(new CustomEvent('ocr:refresh'));
          }
        }
        // Decrement credits
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid && credits !== null) {
          const newVal = Math.max(0, credits - 1);
          const { data: updated, error } = await supabase
            .from('user_credits')
            .update(isBill ? { ocr_bill: newVal } : { ocr_bank: newVal })
            .eq('user_id', uid)
            .select(isBill ? 'ocr_bill' : 'ocr_bank')
            .single();
          if (!error) {
            if (isBill) setBillCredits((updated as any)?.ocr_bill ?? newVal);
            else setBankCredits((updated as any)?.ocr_bank ?? newVal);
          }
        }
        toast({ title: 'Analyzed', description: 'Re-analysis complete.' });
      } catch (e) {
        console.error('Analyze failed', e);
        toast({ title: 'Error', description: 'Could not analyze item.' });
      }
    }, 1000);
  };

  const exportRow = (it: Item) => {
    try {
      const blob = new Blob([JSON.stringify(it.data ?? {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(it.filename || `${it.type}-${it.id}`).replace(/\s+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <meta name="description" content="View your OCR Bill and Bank extraction history in one place." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">Bill: {billCredits ?? "—"} / {billMax ?? "—"}</Badge>
          <Badge variant="secondary">Bank: {bankCredits ?? "—"} / {bankMax ?? "—"}</Badge>
          <Badge variant="outline">Total: {items.length}</Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent Extractions</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="bill">Bills</TabsTrigger>
              <TabsTrigger value="bank">Banks</TabsTrigger>
            </TabsList>
            {(["all", "bill", "bank"] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                <div className="divide-y rounded-md border">
                  {loading ? (
                    <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                  ) : (
                    items
                      .filter((i) => tab === "all" || i.type === tab)
                      .map((i) => {
                        const k = keyOf(i);
                        const c = getCtrl(k);
                        return (
                          <div key={`${i.type}-${i.id}`}>
                            <div className="flex items-center gap-3 p-3 hover:bg-muted/30 focus:bg-muted/30 focus:outline-none">
                              <a href={`/ocr/${i.type}/${i.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                                <Badge variant="outline" className="shrink-0 capitalize">{i.type}</Badge>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{i.filename || (i.type === "bill" ? "Bill" : "Bank")} </div>
                                  <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
                                </div>
                                {i.approved && (
                                  <span className="text-green-600 dark:text-green-400" title="Approved" aria-label="Approved">
                                    <CheckCircle2 className="h-4 w-4" />
                                  </span>
                                )}
                                <div className="text-xs text-muted-foreground max-w-[40%] truncate">
                                  {i.type === "bill" ? (i.data?.["หมายเลขใบเอกสาร (Doc_number)"] ?? i.data?.bill_no ?? "") : (i.data?.reference ?? "")}
                                </div>
                              </a>
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-2"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpand(k); }}
                                aria-label="Quick actions"
                              >
                                {expanded[k] ? "Hide" : "Actions"}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-2 z-10"
                                    aria-label="Item actions"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={async (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    const name = window.prompt('Rename file', i.filename || '');
                                    if (name !== null) {
                                      const table = i.type === 'bill' ? 'ocr_bill_extractions' : 'ocr_bank_extractions';
                                      const { error } = await supabase.from(table).update({ filename: name }).eq('id', i.id);
                                      if (!error) {
                                        setItems((prev) => prev.map((it) => it.id === i.id ? { ...it, filename: name } : it));
                                      }
                                    }
                                  }}>Rename</DropdownMenuItem>
                                  <DropdownMenuItem onClick={async (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    if (!window.confirm('Delete this item?')) return;
                                    const table = i.type === 'bill' ? 'ocr_bill_extractions' : 'ocr_bank_extractions';
                                    const { error } = await supabase.from(table).delete().eq('id', i.id);
                                    if (!error) {
                                      setItems((prev) => prev.filter((it) => it.id !== i.id));
                                    }
                                  }}>Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {expanded[k] && (
                              <div className="px-3 pb-3">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <Button variant="outline" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoomOutFor(k); }} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
                                  <Button variant="outline" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoomInFor(k); }} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
                                  <Button variant="outline" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); flipFor(k); }} aria-label="Flip"><FlipHorizontal className="h-4 w-4" /></Button>
                                  <Button variant="outline" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); rotateFor(k); }} aria-label="Rotate"><RotateCw className="h-4 w-4" /></Button>
                                  <Button variant="outline" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); resetFor(k); }} aria-label="Reset view"><RefreshCw className="h-4 w-4" /></Button>
                                  <span className="text-xs text-muted-foreground ml-2">Zoom: {(getCtrl(k).scale * 100).toFixed(0)}%</span>
                                  <div className="ml-auto">
                                    <Badge variant="secondary">{i.type === 'bill' ? `Bill: ${billCredits ?? '—'} / ${billMax ?? '—'}` : `Bank: ${bankCredits ?? '—'} / ${bankMax ?? '—'}`}</Badge>
                                  </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="aspect-[4/3] rounded-md border overflow-auto bg-muted/30 flex items-center justify-center">
                                    {getCtrl(k).preview || i.file_url ? (
                                      <img
                                        src={getCtrl(k).preview ?? (i.file_url as string)}
                                        alt={`${i.type} document`}
                                        loading="lazy"
                                        style={{ transform: `${getCtrl(k).flipped ? "scaleX(-1) " : ""}rotate(${getCtrl(k).rotation}deg) scale(${getCtrl(k).scale})`, transformOrigin: "center center" }}
                                        className="object-contain"
                                      />
                                    ) : (
                                      <div className="text-sm text-muted-foreground">No image available</div>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Input type="file" accept="image/*,.pdf" onChange={(e) => onFileChange(k, e.target.files?.[0] ?? null)} />
                                      {getCtrl(k).file && (
                                        <Button variant="secondary" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFileChange(k, null); }}>Reset</Button>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); analyzeRow(i); }} disabled={getCtrl(k).processing || ((i.type === 'bill' ? billCredits : bankCredits) !== null && (i.type === 'bill' ? (billCredits as number) : (bankCredits as number)) <= 0)}>
                                        {getCtrl(k).processing ? "Processing..." : ((i.type === 'bill' ? billCredits : bankCredits) !== null && (i.type === 'bill' ? (billCredits as number) : (bankCredits as number)) <= 0) ? "Out of credits" : "Analyze"}
                                      </Button>
                                      <Button variant="secondary" onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveRow(i); }}>Save</Button>
                                      <Button variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); exportRow(i); }} aria-label="Export JSON">
                                        <Download className="h-4 w-4" />
                                      </Button>
                                      <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); approveRow(i); }} disabled={!!i.approved}>Approve</Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                  {!loading && items.filter((i) => tab === "all" || i.type === tab).length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">No history yet.</div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
