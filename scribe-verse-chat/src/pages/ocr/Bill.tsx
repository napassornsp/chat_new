import { Helmet } from "react-helmet-async";
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import service from "@/services/backend";

type CreditsPayload = {
  plan: string;
  chat: { used: number; limit: number; remaining: number; percent_used: number };
  ocr_bill: { used: number; limit: number; remaining: number; percent_used: number };
  ocr_bank: { used: number; limit: number; remaining: number; percent_used: number };
};

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
const authHeader = () => {
  const tok = localStorage.getItem("offline_token") || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

/** [label, key] */
const FIELD_DEF: Array<[string, string]> = [
  ["ชื่อผู้ซื้อภาษาไทย (buyer_name_thai)", "buyer_name_thai"],
  ["ชื่อผู้ซื้อภาษาอังกฤษ (buyer_name_eng)", "buyer_name_eng"],
  ["สาขาผู้ซื้อ (buyer_branch)", "buyer_branch"],
  ["ที่อยู่ผู้ซื้อภาษาไทย (buyer_address_thai)", "buyer_address_thai"],
  ["ที่อยู่ผู้ซื้อภาษาอังกฤษ (buyer_address_eng)", "buyer_address_eng"],
  ["หมายเลขภาษีผู้ซื้อ (buyer_vat_number)", "buyer_vat_number"],
  ["ชื่อผู้ขายภาษาไทย (seller_name_thai)", "seller_name_thai"],
  ["ชื่อผู้ขายภาษาอังกฤษ (seller_name_eng)", "seller_name_eng"],
  ["สาขาผู้ขาย (seller_branch)", "seller_branch"],
  ["ที่อยู่ผู้ขายภาษาไทย (seller_address_thai)", "seller_address_thai"],
  ["ที่อยู่ผู้ขายภาษาอังกฤษ (seller_address_eng)", "seller_address_eng"],
  ["หมายเลขภาษีผู้ขาย (seller_vat_number)", "seller_vat_number"],
  ["ประเภทเอกสาร (document_type)", "document_type"],
  ["หมายเลขใบเอกสาร (doc_number)", "doc_number"],
  ["วันที่ของเอกสาร (doc_date)", "doc_date"],
  ["จำนวนเงินส่วนลด (discount_amount)", "discount_amount"],
  ["ยอดรวมส่วนลด (amount_after_discount)", "amount_after_discount"],
  ["ยอดรวมก่อนภาษี (sub_total)", "sub_total"],
  ["เปอร์เซ็นต์ภาษีหัก ณ ที่จ่าย (WHT_%)", "wht_percent"],
  ["จำนวนเงินภาษีหัก ณ ที่จ่าย (WHT_amount)", "wht_amount"],
  ["เปอร์เซ็นต์ภาษีมูลค่าเพิ่ม (vat_%)", "vat_percent"],
  ["จำนวนเงินภาษีมูลค่าเพิ่ม (vat_amount)", "vat_amount"],
  ["ยอดรวมสุทธิ (total_due_amount)", "total_due_amount"],
  ["ยอดรวมตัวอักษร (text_amount)", "text_amount"],
  ["สกุลเงิน (currency)", "currency"],
  ["อัตราแลกเปลี่ยน (exchange_rate)", "exchange_rate"],
  ["เบอร์แฟกซ์ผู้ขาย (seller_fax_number)", "seller_fax_number"],
  ["เบอร์แฟกซ์ผู้ซื้อ (buyer_fax_number)", "buyer_fax_number"],
  ["เบอร์โทรศัพท์ผู้ขาย (seller_phone)", "seller_phone"],
  ["เบอร์โทรศัพท์ผู้ซื้อ (buyer_phone)", "buyer_phone"],
  ["รหัสลูกค้า (client_id)", "client_id"],
  ["วันครบกำหนดชำระเงิน (payment_due_date)", "payment_due_date"],
  ["หมายเลขคำสั่งซื้อ (po_number)", "po_number"],
  ["อีเมลผู้ขาย (seller_email)", "seller_email"],
  ["เว็บไซต์ผู้ขาย (seller_website)", "seller_website"],
  ["ที่อยู่จัดส่งสินค้า (shipto_address)", "shipto_address"],
  ["รหัสสินค้า (product_code)", "product_code"],
];

export default function OCRBill() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/ocr/bill" : "";
  const title = useMemo(() => "OCR Processing - Bill", []);
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [fields, setFields] = useState<Record<string, any>>({});
  const [raw, setRaw] = useState<any>(null);
  const [elapsed, setElapsed] = useState<string>("–");
  const [credits, setCredits] = useState<CreditsPayload | null>(null);

  const [ocrId, setOcrId] = useState<string | null>(null);

  const onFile = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    setFields({});
    setRaw(null);
    setOcrId(null);
  };

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, []); // cleanup

  const fetchCredits = async () => {
    try {
      const r = await fetch(`${API}/rpc/get_credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data?.data?.credits) setCredits(data.data.credits);
    } catch {}
  };
  useEffect(() => { fetchCredits(); }, []);

  // Listen for "open from history"
  useEffect(() => {
    async function onOpen(e: any) {
      const { type, id } = e.detail || {};
      if (type !== "bill") return;
      const row = await service.getOcr("bill", String(id));
      if (!row) return;
      setOcrId(String(row.id));
      setFields(row.data || {});
      setRaw({ from: "history", id: row.id, data: row.data });
      if (row.file_url) setPreview(row.file_url);
    }
    window.addEventListener("ocr:open", onOpen as any);
    return () => window.removeEventListener("ocr:open", onOpen as any);
  }, []);

  const analyze = async () => {
    if (!file) return;
    setProcessing(true);
    setElapsed("…");
    const t0 = performance.now();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/vision/ocr/bill`, {
        method: "POST",
        headers: { ...authHeader() },
        body: fd,
      });
      const data = await r.json();
      const fx = data?.data?.fields ?? {};
      setFields(fx);
      setRaw(data);
      if (data?.credits) setCredits(data.credits);

      const created = await service.createOcr("bill", {
        filename: file.name ?? null,
        file_url: null,
        data: fx,
        approved: false,
      });
      setOcrId(created.id);
      window.dispatchEvent(new Event("ocr:refresh")); // refresh sidebar list
    } catch (e) {
      console.error(e);
    } finally {
      const t1 = performance.now();
      setElapsed(`${Math.round(t1 - t0) / 1000}s`);
      setProcessing(false);
    }
  };

  const approve = async () => {
    if (!ocrId) return;
    try {
      await service.updateOcr("bill", ocrId, { approved: true });
      window.dispatchEvent(new Event("ocr:refresh"));
    } catch (e) {
      console.error(e);
    }
  };

  const normalizeFieldsForSave = (obj: Record<string, any>) => {
    const out = { ...obj };
    if (typeof out.table === "string") {
      try { out.table = JSON.parse(out.table); } catch {}
    }
    return out;
  };

  const saveData = async () => {
    if (!ocrId) return;
    try {
      await service.updateOcr("bill", ocrId, { data: normalizeFieldsForSave(fields) });
      window.dispatchEvent(new Event("ocr:refresh"));
    } catch (e) {
      console.error(e);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ fields, raw }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bill_ocr_${ocrId ?? "draft"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>

        {/* Mode switcher */}
        <Select
          value="bill"
          onValueChange={(v) => navigate(v === "bank" ? "/ocr/bank" : "/ocr/bill")}
        >
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="Select OCR Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bill">Bill Processing</SelectItem>
            <SelectItem value="bank">Bank Processing</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">
            Credits: {credits?.ocr_bill?.remaining ?? 0} / {credits?.ocr_bill?.limit ?? 0}
          </Badge>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-[4/3] rounded-md border flex items-center justify-center overflow-hidden bg-muted/30">
              {preview ? (
                <img src={preview} alt="Preview" className="h-full w-full object-contain" />
              ) : (
                <div className="text-sm text-muted-foreground">No document selected</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {file && <Button variant="secondary" onClick={() => onFile(null)}>Reset</Button>}
            </div>
            <Button className="w-full" disabled={!file || processing} onClick={analyze}>
              {processing ? "Processing..." : "Analyze"}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FIELD_DEF.map(([label, key]) => (
                    <Input
                      key={key}
                      placeholder={label}
                      value={fields?.[key] ?? ""}
                      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  ))}
                </div>

                <Textarea
                  placeholder="ตาราง (Table)"
                  value={
                    typeof fields?.table === "string"
                      ? fields.table
                      : JSON.stringify(fields?.table ?? "", null, 2)
                  }
                  onChange={(e) => setFields((f) => ({ ...f, table: e.target.value }))}
                />

                <div className="text-xs text-muted-foreground">Processing time: {elapsed}</div>

                <div className="flex gap-2">
                  <Button onClick={approve} disabled={!ocrId || processing}>Approve File</Button>
                  <Button variant="secondary" onClick={saveData} disabled={!ocrId || processing}>Save Data</Button>
                  <Button variant="outline" onClick={exportJson} disabled={!fields || processing}>Export</Button>
                </div>
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(raw ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
