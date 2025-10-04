import { Helmet } from "react-helmet-async";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VisionModeSelect from "@/pages/vision/VisionModeSelect";

type Box = { label: string; conf: number; xyxy: [number, number, number, number]; color?: string };
type DetectResponse = { image: { width: number; height: number }; boxes: Box[] };

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
const ENDPOINT = "/vision/flower/detect"; // <- same pattern as person: /vision/<thing>/detect

const authHeader = () => {
  const tok = localStorage.getItem("offline_token") || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

export default function FlowerDetection() {
  const canonical =
    typeof window !== "undefined" ? window.location.origin + "/vision/flower-detection" : "";
  const title = useMemo(() => "Flower Detection", []);

  // file/image
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgWH, setImgWH] = useState<{ w: number; h: number } | null>(null);

  // results
  const [processing, setProcessing] = useState(false);
  const [resp, setResp] = useState<DetectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<string>("–");

  // canvases & image
  const inRef = useRef<HTMLCanvasElement | null>(null);
  const outRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // view state
  const [inView, setInView] = useState({ scale: 1, dx: 0, dy: 0 });
  const [outView, setOutView] = useState({ scale: 1, dx: 0, dy: 0 });

  // helpers
  const clamp = (s: number) => Math.max(0.2, Math.min(5, s));
  const zoomAt = (which: "in" | "out", x: number, y: number, factor: number) => {
    const set = which === "in" ? setInView : setOutView;
    set((v) => {
      const ns = clamp(v.scale * factor);
      const r = ns / v.scale;
      return { scale: ns, dx: x - (x - v.dx) * r, dy: y - (y - v.dy) * r };
    });
  };

  const onFile = (f: File | null) => {
    setFile(f);
    setResp(null);
    setError(null);
    setElapsed("–");
    setInView({ scale: 1, dx: 0, dy: 0 });
    setOutView({ scale: 1, dx: 0, dy: 0 });
    if (!f) {
      setImgUrl(null);
      setImgWH(null);
      return;
    }
    setImgUrl(URL.createObjectURL(f));
  };

  // load image
  useEffect(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgWH({ w: img.width, h: img.height });
      drawInput();
    };
    img.src = imgUrl;
    return () => {
      imgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgUrl]);

  // fit canvas to its parent, preserve aspect
  const fitCanvasToParent = (cvs: HTMLCanvasElement, w: number, h: number) => {
    const maxW = cvs.parentElement ? cvs.parentElement.clientWidth : 560;
    const scale = Math.min(1, maxW / w);
    cvs.width = Math.round(w * scale);
    cvs.height = Math.round(h * scale);
  };

  // draw input
  const drawInput = () => {
    const cvs = inRef.current, img = imgRef.current, wh = imgWH;
    if (!cvs || !img || !wh) return;
    fitCanvasToParent(cvs, wh.w, wh.h);
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.translate(inView.dx, inView.dy);
    ctx.scale(inView.scale, inView.scale);
    ctx.drawImage(img, 0, 0, cvs.width / inView.scale, cvs.height / inView.scale);
    ctx.restore();
  };

  // draw output
  const drawOutput = () => {
    const cvs = outRef.current, img = imgRef.current, wh = imgWH;
    if (!cvs || !img || !wh) return;
    fitCanvasToParent(cvs, wh.w, wh.h);
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.translate(outView.dx, outView.dy);
    ctx.scale(outView.scale, outView.scale);
    ctx.drawImage(img, 0, 0, cvs.width / outView.scale, cvs.height / outView.scale);

    if (resp?.boxes?.length) {
      const sx = (cvs.width / outView.scale) / (resp.image?.width || wh.w);
      const sy = (cvs.height / outView.scale) / (resp.image?.height || wh.h);
      ctx.lineWidth = 2;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      for (const b of resp.boxes) {
        const [x1, y1, x2, y2] = b.xyxy;
        const rx = x1 * sx, ry = y1 * sy, rw = (x2 - x1) * sx, rh = (y2 - y1) * sy;
        const c = b.color || "#22c55e";
        ctx.strokeStyle = c;
        ctx.strokeRect(rx, ry, rw, rh);
        const label = `${b.label} ${(b.conf * 100).toFixed(0)}%`;
        const pad = 6, pillH = 18, textW = ctx.measureText(label).width;
        ctx.fillStyle = c;
        ctx.fillRect(rx, ry - pillH, textW + pad * 2, pillH);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, rx + pad, ry - 5);
      }
    }
    ctx.restore();
  };

  useEffect(() => { drawInput(); }, [imgWH, inView]); // eslint-disable-line
  useEffect(() => { drawOutput(); }, [imgWH, outView, resp]); // eslint-disable-line

  // interactions
  const makeWheel = (which: "in" | "out") => (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cvs = which === "in" ? inRef.current! : outRef.current!;
    const r = cvs.getBoundingClientRect();
    zoomAt(which, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 0.9);
  };

  const dragRef = useRef<{ which: "in" | "out"; drag: boolean; x: number; y: number } | null>(null);
  const onDown = (which: "in" | "out") => (e: React.MouseEvent<HTMLCanvasElement>) =>
    (dragRef.current = { which, drag: true, x: e.clientX, y: e.clientY });
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current; if (!d?.drag) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    (d.which === "in" ? setInView : setOutView)((v) => ({ ...v, dx: v.dx + dx, dy: v.dy + dy }));
  };
  const onUp = () => { if (dragRef.current) dragRef.current.drag = false; };

  const ZoomHUD: React.FC<{ which: "in" | "out" }> = ({ which }) => {
    const scale = which === "in" ? inView.scale : outView.scale;
    const cvs = which === "in" ? inRef.current : outRef.current;
    const center = () => {
      const r = cvs?.getBoundingClientRect();
      return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
    };
    return (
      <div className="absolute right-2 top-2 z-10">
        <div className="flex items-center gap-2 rounded-md border bg-white/90 backdrop-blur px-2 py-1 shadow-sm">
          <button onClick={(e) => { e.stopPropagation(); const c = center(); zoomAt(which, c.x, c.y, 0.9); }}
            className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-sm">−</button>
          <span className="text-xs w-[44px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={(e) => { e.stopPropagation(); const c = center(); zoomAt(which, c.x, c.y, 1.1); }}
            className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-sm">+</button>
        </div>
      </div>
    );
  };

  const analyze = async () => {
    if (!file) return;
    setProcessing(true);
    setResp(null);
    setError(null);
    const t0 = performance.now();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}${ENDPOINT}`, {
        method: "POST",
        headers: { ...authHeader() },
        body: fd,
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      const data: DetectResponse = await r.json();
      setResp(data); // strictly backend data
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setElapsed(`${Math.round(performance.now() - t0)} ms`);
      setProcessing(false);
    }
  };

  return (
    <div className="container py-6">
      <Helmet>
        <title>{`${title} | Vision AI`}</title>
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        {/* unified dropdown for all Vision pages */}
        <VisionModeSelect />
        <div className="ml-auto">
          <Badge variant="secondary">Mode: Flower</Badge>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        {/* LEFT: input */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Upload Image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative rounded-md border bg-muted/30 p-2">
              <ZoomHUD which="in" />
              <canvas
                ref={inRef}
                className="block w-full h-auto cursor-grab active:cursor-grabbing"
                onWheel={makeWheel("in")}
                onMouseDown={onDown("in")}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
              />
              <div className="mt-2 text-[11px] text-muted-foreground">
                Scroll to zoom. Drag to pan.
              </div>
            </div>

            <Input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />

            <Button
              className="w-full max-w-[220px] mx-auto"
              disabled={!file || processing}
              onClick={analyze}
            >
              {processing ? "Processing..." : "Analyze"}
            </Button>
          </CardContent>
        </Card>

        {/* RIGHT: results */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="results">
              <TabsList className="grid grid-cols-2 w-full h-9">
                <TabsTrigger value="results" className="text-sm">Results</TabsTrigger>
                <TabsTrigger value="raw" className="text-sm">Raw Data</TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="space-y-3 mt-4">
                <div className="relative rounded-md border bg-muted/20 p-2">
                  <ZoomHUD which="out" />
                  <canvas
                    ref={outRef}
                    className="block w-full h-auto cursor-grab active:cursor-grabbing"
                    onWheel={makeWheel("out")}
                    onMouseDown={onDown("out")}
                    onMouseMove={onMove}
                    onMouseUp={onUp}
                    onMouseLeave={onUp}
                  />
                </div>

                <div className="text-[11px] text-muted-foreground">Processing time: {elapsed}</div>

                {error ? (
                  <div className="rounded-md border px-3 py-4 text-sm text-red-600">{error}</div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <div className="grid grid-cols-3 px-3 py-2 text-xs text-muted-foreground border-b">
                      <span>Label</span>
                      <span>Confidence</span>
                      <span>Location</span>
                    </div>
                    {resp?.boxes?.length ? (
                      resp.boxes.map((b, i) => {
                        const [x1, y1, x2, y2] = b.xyxy;
                        return (
                          <div key={i} className="grid grid-cols-3 px-3 py-2 text-sm">
                            <span className="truncate">{b.label}</span>
                            <span>{(b.conf * 100).toFixed(1)}%</span>
                            <span className="truncate">[{x1}, {y1}, {x2}, {y2}]</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-4 text-sm text-muted-foreground">
                        {resp ? "No detections returned by server." : "Upload an image and click Analyze."}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(resp ?? (error ? { error } : {}), null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
