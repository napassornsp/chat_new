import { Helmet } from "react-helmet-async";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";

type Box = { label: string; conf: number; xyxy: [number, number, number, number]; color?: string };
type DetectResponse = { image: { width: number; height: number }; boxes: Box[] };

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
function authHeader() {
  const tok = localStorage.getItem("offline_token") || "";
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export default function VisionFlower() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/vision/flower" : "";
  const title = useMemo(() => "Flower Detection", []);
  const navigate = useNavigate();

  // image/file state
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  // detection results
  const [processing, setProcessing] = useState(false);
  const [resp, setResp] = useState<DetectResponse | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // view state
  const [viewIn, setViewIn] = useState({ scale: 1, dx: 0, dy: 0 });
  const [viewOut, setViewOut] = useState({ scale: 1, dx: 0, dy: 0 });

  // refs
  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // drag state
  const dragRef = useRef<{ which: "in" | "out"; dragging: boolean; lastX: number; lastY: number } | null>(null);

  // load image
  const onFile = (f: File | null) => {
    setFile(f);
    setResp(null);
    setElapsedMs(null);
    setViewIn({ scale: 1, dx: 0, dy: 0 });
    setViewOut({ scale: 1, dx: 0, dy: 0 });
    if (!f) { setImgUrl(null); setImgNatural(null); return; }
    const url = URL.createObjectURL(f);
    setImgUrl(url);
  };

  useEffect(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.onload = () => {
      setImgNatural({ w: img.width, h: img.height });
      imgRef.current = img;
      drawInput();
    };
    img.src = imgUrl;
    return () => { imgRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgUrl]);

  // draw input
  const drawInput = () => {
    const cvs = inputCanvasRef.current, img = imgRef.current;
    if (!cvs || !img || !imgNatural) return;
    const parent = cvs.parentElement;
    const maxW = parent ? parent.clientWidth : 560;
    const scaleFit = maxW / imgNatural.w;
    const canvasW = Math.round(imgNatural.w * scaleFit);
    const canvasH = Math.round(imgNatural.h * scaleFit);
    cvs.width = canvasW; cvs.height = canvasH;
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.translate(viewIn.dx, viewIn.dy);
    ctx.scale(viewIn.scale, viewIn.scale);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
    ctx.restore();
  };

  // draw output
  const drawOutput = () => {
    const cvs = outputCanvasRef.current, img = imgRef.current;
    if (!cvs || !img || !imgNatural) return;
    const inCvs = inputCanvasRef.current;
    const canvasW = inCvs?.width ?? 560;
    const canvasH = inCvs?.height ?? 420;
    cvs.width = canvasW; cvs.height = canvasH;
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.translate(viewOut.dx, viewOut.dy);
    ctx.scale(viewOut.scale, viewOut.scale);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);

    if (resp?.boxes?.length) {
      for (const b of resp.boxes) {
        const sx = canvasW / (resp.image?.width || imgNatural.w);
        const sy = canvasH / (resp.image?.height || imgNatural.h);
        const [x1, y1, x2, y2] = b.xyxy;
        const rx1 = x1 * sx, ry1 = y1 * sy, rw = (x2 - x1) * sx, rh = (y2 - y1) * sy;
        const color = b.color || "#22c55e";
        ctx.lineWidth = 2; ctx.strokeStyle = color;
        ctx.strokeRect(rx1, ry1, rw, rh);
        const label = `${b.label} ${(b.conf * 100).toFixed(0)}%`;
        ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
        const padX = 6, pillH = 18, textW = ctx.measureText(label).width, pillW = textW + padX * 2;
        ctx.fillStyle = color; ctx.fillRect(rx1, ry1 - pillH, pillW, pillH);
        ctx.fillStyle = "#fff"; ctx.fillText(label, rx1 + padX, ry1 - 5);
      }
    }
    ctx.restore();
  };

  useEffect(() => { drawInput(); }, [viewIn, imgNatural]); // eslint-disable-line
  useEffect(() => { drawOutput(); }, [viewOut, imgNatural, resp]); // eslint-disable-line

  /** -------- Zoom/Pan helpers ---------- */
  const clampScale = (s: number) => Math.max(0.2, Math.min(5, s));

  // zoom at point (cursor or center)
  const zoomAt = (which: "in" | "out", x: number, y: number, factor: number) => {
    const set = which === "in" ? setViewIn : setViewOut;
    set(v => {
      const newScale = clampScale(v.scale * factor);
      const scaleRatio = newScale / v.scale;
      const nx = x - (x - v.dx) * scaleRatio;
      const ny = y - (y - v.dy) * scaleRatio;
      return { scale: newScale, dx: nx, dy: ny };
    });
  };

  // wheel zoom (cursor-centric)
  const handleWheel = (which: "in" | "out") => (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cvs = (which === "in" ? inputCanvasRef.current : outputCanvasRef.current)!;
    const rect = cvs.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(which, x, y, factor);
  };

  // mouse drag to pan
  const handleMouseDown = (which: "in" | "out") => (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { which, dragging: true, lastX: e.clientX, lastY: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || !d.dragging) return;
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY;
    d.lastX = e.clientX; d.lastY = e.clientY;
    (d.which === "in" ? setViewIn : setViewOut)(v => ({ ...v, dx: v.dx + dx, dy: v.dy + dy }));
  };
  const handleMouseUp = () => { if (dragRef.current) dragRef.current.dragging = false; };

  // touch: pan + pinch
  const pinchRef = useRef<{ which: "in" | "out"; lastDist: number } | null>(null);
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const handleTouchStart = (which: "in" | "out") => (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      dragRef.current = { which, dragging: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      pinchRef.current = { which, lastDist: dist(e.touches as unknown as TouchList) };
    }
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && dragRef.current?.dragging) {
      const d = dragRef.current;
      const dx = e.touches[0].clientX - d.lastX, dy = e.touches[0].clientY - d.lastY;
      d.lastX = e.touches[0].clientX; d.lastY = e.touches[0].clientY;
      (d.which === "in" ? setViewIn : setViewOut)(v => ({ ...v, dx: v.dx + dx, dy: v.dy + dy }));
    } else if (e.touches.length === 2 && pinchRef.current) {
      const newDist = dist(e.touches as unknown as TouchList);
      const factor = newDist > pinchRef.current.lastDist ? 1.03 : 0.97;
      pinchRef.current.lastDist = newDist;
      const cvs = (pinchRef.current.which === "in" ? inputCanvasRef.current : outputCanvasRef.current)!;
      const rect = cvs.getBoundingClientRect();
      // pinch center
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      zoomAt(pinchRef.current.which, cx, cy, factor);
    }
  };
  const handleTouchEnd = () => { if (dragRef.current) dragRef.current.dragging = false; pinchRef.current = null; };

  /** -------- Zoom HUD (− 100% +) ---------- */
  const ZoomHUD: React.FC<{ which: "in" | "out" }> = ({ which }) => {
    const scale = which === "in" ? viewIn.scale : viewOut.scale;
    const cvs = (which === "in" ? inputCanvasRef.current : outputCanvasRef.current);
    const center = () => {
      const rect = cvs?.getBoundingClientRect();
      return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
    };
    const onMinus = (e: React.MouseEvent) => { e.stopPropagation(); const c = center(); zoomAt(which, c.x, c.y, 0.9); };
    const onPlus  = (e: React.MouseEvent) => { e.stopPropagation(); const c = center(); zoomAt(which, c.x, c.y, 1.1); };

    return (
      <div className="absolute right-2 top-2 z-10 select-none">
        <div className="flex items-center gap-2 rounded-md border bg-white/90 backdrop-blur px-2 py-1 shadow-sm">
          <button
            aria-label="Zoom out"
            onClick={onMinus}
            className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-sm"
          >−</button>
          <span className="text-xs w-[44px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={onPlus}
            className="h-6 w-6 grid place-items-center rounded hover:bg-muted text-sm"
          >+</button>
        </div>
      </div>
    );
  };

  // call backend
  const analyze = async () => {
    if (!file) return;
    setProcessing(true);
    setElapsedMs(null);
    setResp(null);
    const t0 = performance.now();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/vision/yolo/detect`, {
        method: "POST",
        headers: { ...authHeader() },
        body: fd,
      });
      const data: DetectResponse = await res.json();
      setResp(data);
    } catch (e) {
      console.error(e);
      setResp({ image: { width: imgNatural?.w || 640, height: imgNatural?.h || 480 }, boxes: [] });
    } finally {
      setElapsedMs(Math.round(performance.now() - t0));
      setProcessing(false);
    }
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
        <Select value="flower" onValueChange={(v) => navigate(v === "food" ? "/vision/food" : "/vision/flower")}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="Select Vision Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flower">Flower Detection</SelectItem>
            <SelectItem value="food">Food Classification</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">Mode: Flower</Badge>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        {/* LEFT: Upload + input view */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Upload Image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative rounded-md border bg-muted/30 p-2">
              {/* Zoom HUD */}
              <ZoomHUD which="in" />
              <canvas
                ref={inputCanvasRef}
                className="block w-full h-auto cursor-grab active:cursor-grabbing"
                onWheel={handleWheel("in")}
                onMouseDown={handleMouseDown("in")}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart("in")}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
              <div className="mt-2 text-[11px] md:text-xs text-muted-foreground">
                Tip: Scroll to zoom. Drag to pan. Pinch to zoom on touch devices.
              </div>
            </div>

            <div className="w-full">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="w-full h-9 text-sm"
              />
            </div>

            <div className="pt-1 flex justify-center">
              <Button
                className="h-9 text-sm px-8 w-full max-w-[220px] rounded-lg shadow-sm"
                disabled={!file || processing}
                onClick={analyze}
              >
                {processing ? "Processing..." : "Analyze"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Results */}
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
                  {/* Zoom HUD */}
                  <ZoomHUD which="out" />
                  <canvas
                    ref={outputCanvasRef}
                    className="block w-full h-auto cursor-grab active:cursor-grabbing"
                    onWheel={handleWheel("out")}
                    onMouseDown={handleMouseDown("out")}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart("out")}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                </div>

                <div className="text-[11px] md:text-xs text-muted-foreground">
                  Processing time: {elapsedMs !== null ? `${elapsedMs} ms` : "–"}
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-3 px-3 py-2 text-xs text-muted-foreground border-b">
                    <span>Label</span><span>Confidence</span><span>Location</span>
                  </div>
                  {resp?.boxes?.length ? (
                    resp.boxes.map((b, i) => {
                      const [x1, y1, x2, y2] = b.xyxy;
                      return (
                        <div key={i} className="grid grid-cols-3 px-3 py-2 text-sm">
                          <span className="truncate">{b.label}</span>
                          <span>{(b.conf * 100).toFixed(1)}%</span>
                          <span className="truncate">[x1:{x1}, y1:{y1}, x2:{x2}, y2:{y2}]</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-sm text-muted-foreground">No detections yet.</div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(resp ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
