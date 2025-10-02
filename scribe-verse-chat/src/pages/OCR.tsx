import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OCR() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/ocr" : "";
  const [mode, setMode] = useState<"bill" | "bank">("bill");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const title = useMemo(() => (mode === "bill" ? "OCR Processing - Bill" : "OCR Processing - Bank"), [mode]);

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const analyze = () => {
    setProcessing(true);
    setTimeout(() => setProcessing(false), 1200); // mock
  };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <meta name="description" content="Upload a document and extract structured data with our OCR." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">4 / 5 credits</Badge>
          <Select value={mode} onValueChange={(v) => setMode(v as any)}>
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
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-[4/3] rounded-md border flex items-center justify-center overflow-hidden bg-muted/30">
              {preview ? (
                <img src={preview} alt="Uploaded document preview" className="h-full w-full object-contain" />
              ) : (
                <div className="text-sm text-muted-foreground">No document selected</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {file && (
                <Button variant="secondary" onClick={() => onFile(null)}>Reset</Button>
              )}
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
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Bill Number" defaultValue={mode === "bill" ? "INV-2024-001" : "CHK-123456"} />
                  <Input placeholder="Date" defaultValue="2024-03-15" />
                  <Input placeholder="Vendor" defaultValue={mode === "bill" ? "Electric Company" : "Bank of Example"} />
                  <Input placeholder="Total Amount" defaultValue={mode === "bill" ? "75.90" : "1,000.00"} />
                </div>
                <Textarea placeholder="Address or Notes" defaultValue={mode === "bill" ? "123 Main St, City, State 12345" : "Memo: Payroll"} />
                <div className="text-xs text-muted-foreground">Processing time: {processing ? "…" : "1.2s"}</div>
                <div className="flex gap-2">
                  <Button>Approve File</Button>
                  <Button variant="secondary">Save Data</Button>
                  <Button variant="outline">Export</Button>
                </div>
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify({ confidence: "91%", fields: ["bill_no", "date", "vendor", "total"] }, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
