import { Helmet } from "react-helmet-async";
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function OCRBank() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/ocr/bank" : "";
  const title = useMemo(() => "OCR Processing - Bank", []);
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

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, []);

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
      if (type !== "bank") return;
      const row = await service.getOcr("bank", String(id));
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
      const r = await fetch(`${API}/vision/ocr/bank`, {
        method: "POST",
        headers: { ...authHeader() },
        body: fd,
      });
      const data = await r.json();
      const fx = data?.data?.fields ?? {};
      setFields(fx);
      setRaw(data);
      if (data?.credits) setCredits(data.credits);

      const created = await service.createOcr("bank", {
        filename: file.name ?? null,
        file_url: null,
        data: fx,
        approved: false,
      });
      setOcrId(created.id);
      window.dispatchEvent(new Event("ocr:refresh"));
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
      await service.updateOcr("bank", ocrId, { approved: true });
      window.dispatchEvent(new Event("ocr:refresh"));
    } catch (e) {
      console.error(e);
    }
  };

  const saveData = async () => {
    if (!ocrId) return;
    try {
      await service.updateOcr("bank", ocrId, { data: fields });
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
    a.download = `bank_ocr_${ocrId ?? "draft"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows: Array<any> = Array.isArray(fields?.table) ? fields.table : [];

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
          value="bank"
          onValueChange={(v) => navigate(v === "bill" ? "/ocr/bill" : "/ocr/bank")}
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
            Credits: {credits?.ocr_bank?.remaining ?? 0} / {credits?.ocr_bank?.limit ?? 0}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="Account Number"
                    value={fields?.account_number ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, account_number: e.target.value }))}
                  />
                  <Input
                    placeholder="Statement Period"
                    value={fields?.statement_period ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, statement_period: e.target.value }))}
                  />
                  <Input
                    placeholder="Currency"
                    value={fields?.currency ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, currency: e.target.value }))}
                  />
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-5 text-xs text-muted-foreground border-b px-3 py-2">
                    <span>Time</span>
                    <span className="col-span-2">Description</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Dr / Cr</span>
                  </div>

                  {rows.length ? (
                    rows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-5 px-3 py-2 text-sm border-b last:border-b-0">
                        <span className="truncate">{row.time ?? ""}</span>
                        <span className="truncate col-span-2">{row.description ?? ""}</span>
                        <span className="text-right">{Number(row.amount ?? 0).toLocaleString()}</span>
                        <span className="text-right">
                          {row.dr && Number(row.dr) > 0
                            ? `Dr ${Number(row.dr).toLocaleString()}`
                            : row.cr && Number(row.cr) > 0
                            ? `Cr ${Number(row.cr).toLocaleString()}`
                            : ""}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No transactions parsed.</div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Opening Balance"
                    value={fields?.opening_balance ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, opening_balance: e.target.value }))}
                  />
                  <Input
                    placeholder="Closing Balance"
                    value={fields?.closing_balance ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, closing_balance: e.target.value }))}
                  />
                </div>

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
