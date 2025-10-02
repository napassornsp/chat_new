import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
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

export default function BankDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const canonical = typeof window !== "undefined" ? window.location.origin + `/ocr/bank/${id}` : "";
  const title = useMemo(() => "OCR Processing - Bank", []);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [extracted, setExtracted] = useState({ reference: "", date: "", bank: "", amount: "" });
  const [memoText, setMemoText] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const [bankCredits, setBankCredits] = useState<number | null>(null);
  const [bankMax, setBankMax] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ocr_bank_extractions")
        .select("id, filename, file_url, data, created_at")
        .eq("id", id)
        .single();
      if (data) {
        setSavedId(data.id);
        setPreview(data.file_url ?? null);
        const d: any = data.data || {};
        setExtracted({
          reference: d.reference ?? "",
          date: d.date ?? "",
          bank: d.bank ?? "",
          amount: d.amount ?? "",
        });
        setMemoText(d.memo ?? "");
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    const loadCredits = async () => {
      try {
        const { data, error } = await supabase.rpc('reset_monthly_ocr_credits');
        if (!error && Array.isArray(data) && data.length) {
          setBankCredits((data[0] as any)?.bank ?? null);
        } else if (!error && data && (data as any).bank !== undefined) {
          setBankCredits((data as any).bank ?? null);
        } else {
          const { data: uc } = await supabase.from('user_credits').select('ocr_bank').single();
          if (uc) setBankCredits((uc as any).ocr_bank ?? null);
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: profile } = await supabase.from('profiles').select('plan_id').eq('id', uid).single();
          const planId = (profile as any)?.plan_id;
          if (planId) {
            const { data: plan } = await supabase.from('plans').select('ocr_bank_limit').eq('id', planId).single();
            setBankMax((plan as any)?.ocr_bank_limit ?? 13);
          } else {
            setBankMax(13);
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
    if (bankCredits !== null && bankCredits <= 0) {
      toast({ title: 'Not enough credits', description: 'You have no Bank credits left this month.' });
      return;
    }
    setProcessing(true);
    setTimeout(async () => {
      setProcessing(false);
      setAnalyzed(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (uid && bankCredits !== null) {
          const newVal = Math.max(0, bankCredits - 1);
          const { data: updated, error } = await supabase
            .from('user_credits')
            .update({ ocr_bank: newVal })
            .eq('user_id', uid)
            .select('ocr_bank')
            .single();
          if (!error) setBankCredits(updated?.ocr_bank ?? newVal);
        }
      } catch (e) {
        console.error('Failed to decrement bank credits', e);
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
        data: { reference: extracted.reference, date: extracted.date, bank: extracted.bank, amount: extracted.amount, memo: memoText },
      };
      if (fileUrl !== undefined) payload.file_url = fileUrl;
      if (filename !== undefined) payload.filename = filename;

      const { error } = await supabase.from('ocr_bank_extractions').update(payload).eq('id', id);
      if (error) throw error;
      setSavedId(id || null);
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
      toast({ title: 'Saved', description: 'Bank extraction updated.' });
    } catch (e) {
      console.error('Failed to save bank extraction', e);
      toast({ title: 'Save failed', description: 'Could not update bank extraction.' });
    }
  };

  const approve = async () => {
    try {
      const { error } = await supabase.from('ocr_bank_extractions').update({ approved: true }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Approved', description: 'Marked as approved.' });
      window.dispatchEvent(new CustomEvent('ocr:refresh'));
    } catch (e) {
      console.error('Failed to approve bank extraction', e);
      toast({ title: 'Error', description: 'Could not mark as approved.' });
    }
  };

  const zoomIn = () => setScale((s) => Math.min(4, parseFloat((s + 0.25).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))));
  const resetView = () => { setScale(1); setFlipped(false); };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Company`}</title>
        <meta name="description" content="View and re-process saved bank OCR extraction." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">Bank: {bankCredits ?? "—"} / {bankMax ?? "—"}</Badge>
          <Button variant="secondary" onClick={() => navigate('/ocr/bank')}>Back</Button>
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
            <div className="aspect-[4/3] rounded-md border overflow-auto bg-muted/30 flex items-center justify-center">
              {preview ? (
                <img
                  src={preview}
                  alt="Bank document"
                  loading="lazy"
                  style={{ transform: `${flipped ? "scaleX(-1) " : ""}scale(${scale})`, transformOrigin: "center center" }}
                  className="object-contain"
                />
              ) : (
                <div className="text-sm text-muted-foreground">No image available</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              {file && (
                <Button variant="secondary" onClick={() => onFile(null)}>Reset</Button>
              )}
            </div>
            <Button className="w-full" disabled={processing || (bankCredits !== null && bankCredits <= 0)} onClick={analyze}>
              {processing ? "Processing..." : bankCredits !== null && bankCredits <= 0 ? "Out of credits" : "Analyze"}
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
                  <Input placeholder="Reference" value={extracted.reference} onChange={(e) => setExtracted((s) => ({ ...s, reference: e.target.value }))} />
                  <Input placeholder="Date" value={extracted.date} onChange={(e) => setExtracted((s) => ({ ...s, date: e.target.value }))} />
                  <Input placeholder="Bank" value={extracted.bank} onChange={(e) => setExtracted((s) => ({ ...s, bank: e.target.value }))} />
                  <Input placeholder="Amount" value={extracted.amount} onChange={(e) => setExtracted((s) => ({ ...s, amount: e.target.value }))} />
                </div>
                <Textarea placeholder="Memo or Notes" value={memoText} onChange={(e) => setMemoText(e.target.value)} />
                <div className="text-xs text-muted-foreground">Processing time: {processing ? "…" : "1.2s"}</div>
                <div className="flex gap-2">
                  <Button onClick={approve}>Approve File</Button>
                  <Button variant="secondary" onClick={save}>Save Data</Button>
                  <Button variant="outline">Export</Button>
                </div>
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify({ ...extracted, memo: memoText }, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
