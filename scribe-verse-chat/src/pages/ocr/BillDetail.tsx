import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, RefreshCw, FlipHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import BillAnnotator, { BillAnnotatorHandle } from "@/components/ocr/BillAnnotator";
export default function BillDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const canonical = typeof window !== "undefined" ? window.location.origin + `/ocr/bill/${id}` : "";
  const title = useMemo(() => "OCR Processing - Bill", []);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [extracted, setExtracted] = useState({ bill_no: "", date: "", vendor: "", total: "" });
  const [notes, setNotes] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const [billCredits, setBillCredits] = useState<number | null>(null);
  const [billMax, setBillMax] = useState<number | null>(null);

  // Annotation workspace state
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [drawnRect, setDrawnRect] = useState<{ left: number; top: number; width: number; height: number }>({ left: 0, top: 0, width: 0, height: 0 });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<string[][]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const annotatorRef = useRef<BillAnnotatorHandle>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const FIELD_LIST: { key: string; label: string }[] = [
    { key: 'buyer_name_thai', label: 'ชื่อผู้ซื้อภาษาไทย (buyer_name_thai)' },
    { key: 'buyer_name_eng', label: 'ชื่อผู้ซื้อภาษาอังกฤษ (buyer_name_eng)' },
    { key: 'buyer_branch', label: 'สาขาผู้ซื้อ (buyer_branch)' },
    { key: 'buyer_address_thai', label: 'ที่อยู่ผู้ซื้อภาษาไทย (buyer_address_thai)' },
    { key: 'buyer_address_eng', label: 'ที่อยู่ผู้ซื้อภาษาอังกฤษ (buyer_address_eng)' },
    { key: 'buyer_vat_number', label: 'หมายเลขภาษีผู้ซื้อ (buyer_vat_number)' },
    { key: 'seller_name_thai', label: 'ชื่อผู้ขายภาษาไทย (seller_name_thai)' },
    { key: 'seller_name_eng', label: 'ชื่อผู้ขายภาษาอังกฤษ (seller_name_eng)' },
    { key: 'seller_branch', label: 'สาขาผู้ขาย (seller_branch)' },
    { key: 'seller_address_thai', label: 'ที่อยู่ผู้ขายภาษาไทย (seller_address_thai)' },
    { key: 'seller_address_eng', label: 'ที่อยู่ผู้ขายภาษาอังกฤษ (seller_address_eng)' },
    { key: 'seller_vat_number', label: 'หมายเลขภาษีผู้ขาย (seller_vat_number)' },
    { key: 'document_type', label: 'ประเภทเอกสาร (Document type)' },
    { key: 'doc_number', label: 'หมายเลขใบเอกสาร (Doc_number)' },
    { key: 'doc_date', label: 'วันที่ของเอกสาร (Doc_date)' },
    { key: 'discount_amount', label: 'จำนวนเงินส่วนลด (discount_amount)' },
    { key: 'sub_total', label: 'ยอดรวมก่อนภาษี (sub_total)' },
    { key: 'vat_percent', label: 'เปอร์เซ็นต์ภาษีมูลค่าเพิ่ม (vat_%)' },
    { key: 'vat_amount', label: 'จำนวนเงินภาษีมูลค่าเพิ่ม (vat_amount)' },
    { key: 'total_due_amount', label: 'ยอดรวมสุทธิ (total_due_amount)' },
    { key: 'text_amount', label: 'ยอดรวมตัวอักษร (text_amount)' },
    { key: 'currency', label: 'สกุลเงิน (currency)' },
    { key: 'wht_percent', label: 'เปอร์เซ็นต์ภาษีหัก ณ ที่จ่าย (WHT_%)' },
    { key: 'wht_amount', label: 'จำนวนเงินภาษีหัก ณ ที่จ่าย (WHT_amount)' },
    { key: 'seller_fax_number', label: 'เบอร์แฟกซ์ผู้ขาย (seller_fax_number)' },
    { key: 'buyer_fax_number', label: 'เบอร์แฟกซ์ผู้ซื้อ (buyer_fax_number)' },
    { key: 'seller_phone', label: 'เบอร์โทรศัพท์ผู้ขาย (seller_phone)' },
    { key: 'buyer_phone', label: 'เบอร์โทรศัพท์ผู้ซื้อ (buyer_phone)' },
    { key: 'client_id', label: 'รหัสลูกค้า (client_id)' },
    { key: 'payment_due_date', label: 'วันครบกำหนดชำระเงิน (payment_due_date)' },
    { key: 'po_number', label: 'หมายเลขคำสั่งซื้อ (po_number)' },
    { key: 'seller_email', label: 'อีเมลผู้ขาย (seller_email)' },
    { key: 'seller_website', label: 'เว็บไซต์ผู้ขาย (seller_website)' },
    { key: 'shipto_address', label: 'ที่อยู่จัดส่งสินค้า (shipto_address)' },
    { key: 'product_code', label: 'รหัสสินค้า (product_code)' },
    { key: 'exchange_rate', label: 'อัตราแลกเปลี่ยน (exchange rate)' },
  ];
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ocr_bill_extractions")
        .select("id, filename, file_url, data, created_at")
        .eq("id", id)
        .single();
      if (data) {
        setSavedId(data.id);
        setPreview(data.file_url ?? null);
        const d: any = data.data || {};
        setExtracted({
          bill_no: d.bill_no ?? d["หมายเลขใบเอกสาร (Doc_number)"] ?? "",
          date: d.date ?? d["วันที่ของเอกสาร (Doc_date)"] ?? "",
          vendor: d.vendor ?? d["ชื่อผู้ขายภาษาไทย (seller_name_thai)"] ?? "",
          total: d.total ?? d["ยอดรวมสุทธิ (total_due_amount)"] ?? "",
        });
        setNotes(d.notes ?? "");
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    const loadCredits = async () => {
      try {
        const { data, error } = await supabase.rpc('reset_monthly_ocr_credits');
        if (!error && Array.isArray(data) && data.length) {
          setBillCredits((data[0] as any)?.bill ?? null);
        } else if (!error && data && (data as any).bill !== undefined) {
          setBillCredits((data as any).bill ?? null);
        } else {
          const { data: uc } = await supabase.from('user_credits').select('ocr_bill').single();
          if (uc) setBillCredits((uc as any).ocr_bill ?? null);
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: profile } = await supabase.from('profiles').select('plan_id').eq('id', uid).single();
          const planId = (profile as any)?.plan_id;
          if (planId) {
            const { data: plan } = await supabase.from('plans').select('ocr_bill_limit').eq('id', planId).single();
            setBillMax((plan as any)?.ocr_bill_limit ?? 12);
          } else {
            setBillMax(12);
          }
        }
      } catch (e) {
        console.error('Failed to load credits', e);
      }
    };
    loadCredits();
  }, []);

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : preview);
  };

  const analyze = async () => {
    if (billCredits !== null && billCredits <= 0) {
      toast({ title: 'Not enough credits', description: 'You have no Bill credits left this month.' });
      return;
    }
    setProcessing(true);
    setTimeout(async () => {
      setProcessing(false);
      setAnalyzed(true);

      // Seed demo boxes and values for a great editing experience
      try {
        const fk = (k: string) => `field.${k}`;
        const tk = (r: number, c: number) => `table.r${r}.c${c}`;
        const headers = ['ลำดับ', 'รายการสินค้า (Description)', 'จำนวนหน่วย (Quantity)', 'ราคาต่อหน่วย (Unit Price)', 'จำนวนเงิน (Amount)'];

        // Only seed if nothing exists yet
        setBoxes((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const seeded: Record<string, { x: number; y: number; w: number; h: number }> = {};
          const fieldKeys = [
            'buyer_name_thai', 'buyer_name_eng', 'buyer_branch', 'buyer_address_thai', 'buyer_address_eng', 'buyer_vat_number',
            'seller_name_thai', 'seller_name_eng', 'seller_branch', 'seller_address_thai', 'seller_address_eng', 'seller_vat_number',
            'document_type', 'doc_number', 'doc_date', 'discount_amount', 'sub_total', 'vat_percent', 'vat_amount', 'total_due_amount'
          ];
          fieldKeys.slice(0, 12).forEach((k, idx) => {
            seeded[fk(k)] = { x: 48, y: 40 + idx * 44, w: 320, h: 32 };
          });
          // Table cells grid
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < headers.length; c++) {
              seeded[tk(r, c)] = { x: 420 + c * 110, y: 380 + r * 40, w: 100, h: 30 };
            }
          }
          return seeded;
        });
        setTableHeaders((th) => (th.length ? th : headers));
        setTableRows((rows) => (rows.length ? rows : Array.from({ length: 3 }, (_, r) => headers.map((_, c) => `R${r + 1}C${c + 1}`))));
        setFieldValues((fv) => (
          Object.keys(fv).length ? fv : {
            buyer_name_thai: 'บริษัท เอ บี ซี จำกัด',
            buyer_name_eng: 'ABC Co., Ltd.',
            buyer_branch: 'สำนักงานใหญ่',
            buyer_address_thai: '123 ถนนสุขุมวิท กรุงเทพฯ',
            buyer_address_eng: '123 Sukhumvit Rd, Bangkok',
            buyer_vat_number: '0105551234567',
            seller_name_thai: 'บริษัท ดี อี เอฟ จำกัด',
            seller_name_eng: 'DEF Co., Ltd.',
            seller_branch: 'สาขากรุงเทพ',
            seller_address_thai: '456 ถนนพระราม 9 กรุงเทพฯ',
            seller_address_eng: '456 Rama IX Rd, Bangkok',
            seller_vat_number: '0105559876543',
            document_type: 'Invoice',
            doc_number: 'INV-2025-001',
            doc_date: new Date().toISOString().slice(0, 10),
            total_due_amount: '12,345.67',
          }
        ));
      } catch (e) {
        console.error('Seeding annotations failed', e);
      }

      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (uid && billCredits !== null) {
          const newVal = Math.max(0, billCredits - 1);
          const { data: updated, error } = await supabase
            .from('user_credits')
            .update({ ocr_bill: newVal })
            .eq('user_id', uid)
            .select('ocr_bill')
            .single();
          if (!error) setBillCredits(updated?.ocr_bill ?? newVal);
        }
      } catch (e) {
        console.error('Failed to decrement bill credits', e);
        toast({ title: 'Error', description: 'Could not update credits.' });
      }
    }, 1200);
  };

  const save = async () => {
    try {
      let fileUrl: string | null | undefined = undefined;
      let filename: string | null | undefined = undefined;
      if (file) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) throw new Error('Not logged in');
        const path = `${uid}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from('ocr').upload(path, file);
        if (!upErr) {
          const { data: pub } = supabase.storage.from('ocr').getPublicUrl(path);
          fileUrl = pub.publicUrl;
          filename = file.name;
        }
      }

      const payload: any = {
        data: { bill_no: extracted.bill_no, date: extracted.date, vendor: extracted.vendor, total: extracted.total, notes },
      };
      if (fileUrl !== undefined) payload.file_url = fileUrl;
      if (filename !== undefined) payload.filename = filename;

      const { error } = await supabase.from('ocr_bill_extractions').update(payload).eq('id', id);
      if (error) throw error;
      setSavedId(id || null);
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
      toast({ title: 'Saved', description: 'Bill extraction updated.' });
    } catch (e) {
      console.error('Failed to save bill extraction', e);
      toast({ title: 'Save failed', description: 'Could not update bill extraction.' });
    }
  };

  const approve = async () => {
    try {
      const { error } = await supabase.from('ocr_bill_extractions').update({ approved: true }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Approved', description: 'Marked as approved.' });
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
    } catch (e) {
      console.error('Failed to approve bill extraction', e);
      toast({ title: 'Error', description: 'Could not mark as approved.' });
    }
  };

  const zoomIn = () => setScale((s) => Math.min(4, parseFloat((s + 0.25).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))));
  const resetView = () => { setScale(1); setFlipped(false); };

  // Table defaults and helpers
  const DEFAULT_HEADERS = ['ลำดับ', 'รายการสินค้า (Description)', 'จำนวนหน่วย (Quantity)', 'ราคาต่อหน่วย (Unit Price)', 'จำนวนเงิน (Amount)'];
  useEffect(() => {
    if (tableHeaders.length === 0) setTableHeaders(DEFAULT_HEADERS);
    if (tableRows.length === 0) setTableRows(Array.from({ length: 3 }, () => Array(DEFAULT_HEADERS.length).fill('')));
  }, [tableHeaders.length, tableRows.length]);

  const fieldKeyToBoxKey = (k: string) => `field.${k}`;
  const tableKey = (r: number, c: number) => `table.r${r}.c${c}`;

  const ensureBox = (key: string) => {
    setBoxes((prev) => {
      if (prev[key]) return prev;
      // random position/size within 1024x768 base
      const w = 180, h = 36;
      const x = Math.max(10, Math.min(1024 - w - 10, Math.floor(Math.random() * 800)));
      const y = Math.max(10, Math.min(768 - h - 10, Math.floor(Math.random() * 600)));
      return { ...prev, [key]: { x, y, w, h } };
    });
  };

  const focusBox = (key: string) => {
    ensureBox(key);
    setActiveKey(key);
    const cont = containerRef.current;
    const b = boxes[key];
    if (cont && b) {
      // center scroll around the box coordinates in our base space
      const targetX = b.x + b.w / 2 - cont.clientWidth / 2;
      const targetY = b.y + b.h / 2 - cont.clientHeight / 2;
      cont.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: 'smooth' });
    }
  };

  const getValueForKey = (key: string): string => {
    if (key.startsWith('field.')) {
      const f = key.slice(6);
      return fieldValues[f] ?? '';
    }
    const m = key.match(/^table\.r(\d+)\.c(\d+)$/);
    if (m) {
      const r = parseInt(m[1], 10);
      const c = parseInt(m[2], 10);
      return tableRows[r]?.[c] ?? '';
    }
    return '';
  };

  const setValueForKey = (key: string, val: string) => {
    if (key.startsWith('field.')) {
      const f = key.slice(6);
      setFieldValues((prev) => ({ ...prev, [f]: val }));
      return;
    }
    const m = key.match(/^table\.r(\d+)\.c(\d+)$/);
    if (m) {
      const r = parseInt(m[1], 10);
      const c = parseInt(m[2], 10);
      setTableRows((rows) => rows.map((rr, ri) => ri === r ? rr.map((vv, ci) => ci === c ? val : vv) : rr));
    }
  };
  const startDragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const onBoxMouseDown = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const b = boxes[key];
    if (!b) return;
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    startDragRef.current = { key, dx: e.clientX - (rect.left + b.x), dy: e.clientY - (rect.top + b.y) };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!startDragRef.current) return;
      const cont = containerRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      const key = startDragRef.current.key;
      const x = e.clientX - rect.left - startDragRef.current.dx;
      const y = e.clientY - rect.top - startDragRef.current.dy;
      setBoxes((prev) => ({ ...prev, [key]: { ...prev[key], x: Math.max(0, Math.min(1024 - prev[key].w, x)), y: Math.max(0, Math.min(768 - prev[key].h, y)) } }));
    };
    const onUp = () => { startDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [boxes]);
  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <meta name="description" content="View and re-process saved bill OCR extraction." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">Bill: {billCredits ?? "—"} / {billMax ?? "—"}</Badge>
          <Button variant="secondary" onClick={() => navigate('/ocr/bill')}>Back</Button>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={zoomOut} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={zoomIn} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => setFlipped((f) => !f)} aria-label="Reverse image"><FlipHorizontal className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={resetView} aria-label="Reset view"><RefreshCw className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground ml-2">Zoom: {(scale * 100).toFixed(0)}%</span>
            </div>
            <BillAnnotator
              ref={annotatorRef}
              imageUrl={preview}
              scale={scale}
              flipped={flipped}
              boxes={boxes}
              activeKey={activeKey}
              onActiveKeyChange={(k) => {
                setActiveKey(k);
                const el = document.getElementById(`field-${k}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              onBoxesChange={setBoxes}
              onDoubleEdit={(k) => {
                setEditKey(k);
                setEditValue(getValueForKey(k));
                setEditOpen(true);
              }}
            />
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {file && (
                <Button variant="secondary" onClick={() => onFile(null)}>Reset</Button>
              )}
            </div>
            <Button className="w-full" disabled={processing || (billCredits !== null && billCredits <= 0)} onClick={analyze}>
              {processing ? "Processing..." : billCredits !== null && billCredits <= 0 ? "Out of credits" : "Analyze"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extracted Data</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="structured">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="structured">Structured</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>
              <TabsContent value="structured" className="space-y-3 mt-4">
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    {FIELD_LIST.map((f) => {
                      const boxKey = fieldKeyToBoxKey(f.key);
                      return (
                        <div key={f.key} className="space-y-1">
                          <label className="text-xs text-muted-foreground">{f.label}</label>
                          <Input
                            id={`field-${boxKey}`}
                            value={fieldValues[f.key] ?? ""}
                            onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            onFocus={() => { ensureBox(boxKey); annotatorRef.current?.focusBox(boxKey); }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">ตาราง (Table)</div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tableHeaders.length}, minmax(0, 1fr))` }}>
                      {tableHeaders.map((h, c) => (
                        <Input key={`h-${c}`} value={h}
                          onChange={(e) => setTableHeaders((th) => th.map((x, idx) => (idx === c ? e.target.value : x)))} />
                      ))}
                      {tableRows.map((row, r) => (
                        row.map((val, c) => {
                          const k = tableKey(r, c);
                          return (
                            <Input
                              key={`r${r}c${c}`}
                              id={`field-${k}`}
                              value={val}
                              onChange={(e) => setTableRows((rows) => rows.map((rr, ri) => (ri === r ? rr.map((vv, ci) => (ci === c ? e.target.value : vv)) : rr)))}
                              onFocus={() => { ensureBox(k); annotatorRef.current?.focusBox(k); }}
                            />
                          );
                        })
                      ))}
                    </div>
                  </div>

                  <Textarea placeholder="Address or Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <div className="text-xs text-muted-foreground">Processing time: {processing ? "…" : "1.2s"}</div>
                  <div className="flex gap-2">
                    <Button onClick={approve}>Approve File</Button>
                    <Button variant="secondary" onClick={save}>Save Data</Button>
                    <Button variant="outline">Export</Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify({ ...extracted, notes }, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
