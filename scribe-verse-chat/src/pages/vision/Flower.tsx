import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
 
export default function VisionFlower() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/vision/flower" : "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

const title = useMemo(() => "Flower Detection", []);
  const navigate = useNavigate();

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const analyze = () => {
    setProcessing(true);
    setTimeout(() => setProcessing(false), 800); // mock
  };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Vision AI | Company`}</title>
        <meta name="description" content="Analyze images for flower detection with Vision AI." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Select value="flower" onValueChange={(v) => navigate(v === 'food' ? '/vision/food' : '/vision/flower')}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select Vision Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flower">Flower Detection</SelectItem>
            <SelectItem value="food">Food Classification</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">Mode: Flower</Badge>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload Image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-[4/3] rounded-md border flex items-center justify-center overflow-hidden bg-muted/30">
              {preview ? (
                <img src={preview} alt="Uploaded image preview" className="h-full w-full object-contain" loading="lazy" />
              ) : (
                <div className="text-sm text-muted-foreground">No image selected</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
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
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="results">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="space-y-3 mt-4">
                <div className="rounded-md border overflow-hidden">
                  <div className="aspect-[4/3] bg-muted/20 flex items-center justify-center">
                    {preview ? (
                      <img src={preview} alt="Annotated preview" className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <div className="text-sm text-muted-foreground">Annotated image</div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">Processing time: {processing ? "…" : "0.8s"}</div>
                <div className="rounded-md border">
                  <div className="grid grid-cols-3 px-3 py-2 text-xs text-muted-foreground border-b">
                    <span>Label</span><span>Confidence</span><span>Location</span>
                  </div>
                  <div className="grid grid-cols-3 px-3 py-2 text-sm">
                    <span>Rose</span>
                    <span>95.0%</span>
                    <span>100, 100</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline">Export Results</Button>
                </div>
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify({ mode: "flower-detection", results: [{ label: "Rose", confidence: 0.95, bbox: [100,100,50,50] }] }, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
