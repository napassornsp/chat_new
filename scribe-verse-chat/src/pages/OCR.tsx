// src/pages/OCR.tsx
import { Helmet } from "react-helmet-async";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OCRMode = "bill" | "bank";

type Bucket = { limit: number; used: number; remaining: number; percent_used: number };
type CreditsPayload = {
  plan: string;
  chat: Bucket;
  ocr_bill: Bucket;
  ocr_bank: Bucket;
  last_reset_at?: string | null;
};

type OCRResponse = {
  data?: { fields?: Record<string, any> };
  credits?: CreditsPayload;
};

// ---- API helpers ----
const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
function authHeader() {
  const tok = localStorage.getItem("offline_token") || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
async function getCredits(): Promise<CreditsPayload | null> {
  try {
    const r = await fetch(`${API}/rpc/get_credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    return j?.data?.credits ?? null;
  } catch {
    return null;
  }
}

export default function OCR() {
  const [mode, setMode] = useState<OCRMode>("bill");
  const title = useMemo(
    () => (mode === "bill" ? "OCR Processing - Bill" : "OCR Processing - Bank"),
    [mode]
  );

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState<string>("–");

  // credits
  const [credits, setCredits] = useState<CreditsPayload | null>(null);

  // extracted structured fields
  const [fields, setFields] = useState<Record<string, any>>({});

  const canonical =
    typeof window !== "undefined" ? window.location.origin + "/ocr" : "";

  useEffect(() => {
    (async () => setCredits(await getCredits()))();
  }, []);

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setFields({});
  };

  const badgeText = () => {
    if (!credits) return "–";
    const b = mode === "bill" ? credits.ocr_bill : credits.ocr_bank;
    return `${mode === "bill" ? "Bill" : "Bank"}: ${b.used} / ${b.limit}`;
  };

  const analyze = async () => {
    if (!file) return;
    setProcessing(true);
    setElapsed("…");
    try {
      const t0 = performance.now();
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/vision/ocr/${mode}`, {
        method: "POST",
        headers: { ...authHeader() }, // NO "Content-Type" here; let browser set it (multipart boundary)
        body: fd,
      });
      const j: OCRResponse = await r.json();
      setFields(j?.data?.fields || {});
      if (j?.credits) setCredits(j.credits);
      setElapsed(`${Math.round(performance.now() - t0) / 1000}s`);
    } catch (e) {
      console.error(e);
      setElapsed("error");
    } finally {
      setProcessing(false);
    }
  };

  // List (label, key) to render inputs in a consistent order
  const FIELD_DEF: Array<[string, keyof typeof fields]> = [
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
    ["ประเภทเอกสาร (Document type)", "document_type"],
    ["หมายเลขใบเอกสาร (Doc_number)", "doc_number"],
    ["วันที่ของเอกสาร (Doc_date)", "doc_date"],
    ["ตาราง (Table)", "table"],

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
    ["อัตราแลกเปลี่ยน (exchange rate)", "exchange_rate"],
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

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <meta
          name="description"
          content="Upload a document and extract structured data with our OCR."
        />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>

        {/* Top-right: credits + picker */}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{badgeText()}</Badge>
          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as OCRMode);
              // show relevant bucket immediately
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select OCR" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bill">Bill Processing</SelectItem>
              <SelectItem value="bank">Bank Processing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        {/* Left: upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-[4/3] rounded-md border flex items-center justify-center overflow-hidden bg-muted/30">
              {preview ? (
                <img
                  src={preview}
                  alt="Uploaded document preview"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  No document selected
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <Button variant="secondary" onClick={() => onFile(null)}>
                  Reset
                </Button>
              )}
            </div>
            <Button className="w-full" disabled={!file || processing} onClick={analyze}>
              {processing ? "Processing..." : "Analyze"}
            </Button>
          </CardContent>
        </Card>

        {/* Right: results */}
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

              {/* Structured form */}
              <TabsContent value="structured" className="space-y-3 mt-4">
                {/* Text pairs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FIELD_DEF.filter(([label, key]) => key !== "table").map(
                    ([label, key]) => (
                      <Input
                        key={String(key)}
                        placeholder={label}
                        value={fields?.[key] ?? ""}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, [key]: e.target.value }))
                        }
                      />
                    )
                  )}
                </div>

                {/* Table / long text */}
                <Textarea
                  placeholder="ตาราง (Table)"
                  value={
                    typeof fields?.table === "string"
                      ? fields.table
                      : JSON.stringify(fields?.table ?? "", null, 2)
                  }
                  onChange={(e) =>
                    setFields((f) => ({ ...f, table: e.target.value }))
                  }
                />

                <div className="text-xs text-muted-foreground">
                  Processing time: {elapsed}
                </div>

                <div className="flex gap-2">
                  <Button>Approve File</Button>
                  <Button variant="secondary">Save Data</Button>
                  <Button variant="outline">Export</Button>
                </div>
              </TabsContent>

              {/* Raw JSON */}
              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(fields, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
