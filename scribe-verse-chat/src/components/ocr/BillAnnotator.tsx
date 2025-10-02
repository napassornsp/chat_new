import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type Box = { x: number; y: number; w: number; h: number };

export interface BillAnnotatorHandle {
  focusBox: (key: string) => void;
}

interface Props {
  imageUrl: string | null;
  scale: number;
  flipped: boolean;
  boxes: Record<string, Box>;
  activeKey: string | null;
  onActiveKeyChange: (k: string) => void;
  onBoxesChange: (b: Record<string, Box>) => void;
  onDoubleEdit?: (k: string) => void;
}

// Base drawing space (keeps math simple)
const BASE_W = 1024;
const BASE_H = 768;

const handleCls =
  "absolute -right-1 -bottom-1 h-3 w-3 rounded-sm border border-primary/60 bg-primary/70";

const BillAnnotator = forwardRef<BillAnnotatorHandle, Props>(
  (
    { imageUrl, scale, flipped, boxes, activeKey, onActiveKeyChange, onBoxesChange, onDoubleEdit },
    ref
  ) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<{ key: string; dx: number; dy: number } | null>(null);
    const [resize, setResize] = useState<{ key: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

    useImperativeHandle(ref, () => ({
      focusBox: (key: string) => {
        const b = boxes[key];
        const cont = scrollRef.current;
        if (!b || !cont) return;
        const cx = (b.x + b.w / 2) * scale;
        const cy = (b.y + b.h / 2) * scale;
        cont.scrollTo({ left: Math.max(0, cx - cont.clientWidth / 2), top: Math.max(0, cy - cont.clientHeight / 2), behavior: "smooth" });
        onActiveKeyChange(key);
      },
    }));

    useEffect(() => {
      const onMove = (e: MouseEvent) => {
        if (!scrollRef.current) return;
        if (drag) {
          const key = drag.key;
          const rect = scrollRef.current.getBoundingClientRect();
          const x = (e.clientX - rect.left) / scale - drag.dx;
          const y = (e.clientY - rect.top) / scale - drag.dy;
          onBoxesChange({
            ...boxes,
            [key]: {
              ...boxes[key],
              x: Math.max(0, Math.min(BASE_W - boxes[key].w, x)),
              y: Math.max(0, Math.min(BASE_H - boxes[key].h, y)),
            },
          });
        } else if (resize) {
          const key = resize.key;
          const rect = scrollRef.current.getBoundingClientRect();
          const curX = (e.clientX - rect.left) / scale;
          const curY = (e.clientY - rect.top) / scale;
          const w = Math.max(20, Math.min(BASE_W - boxes[key].x, resize.startW + (curX - resize.startX)));
          const h = Math.max(20, Math.min(BASE_H - boxes[key].y, resize.startH + (curY - resize.startY)));
          onBoxesChange({ ...boxes, [key]: { ...boxes[key], w, h } });
        }
      };
      const onUp = () => { setDrag(null); setResize(null); };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, [drag, resize, boxes, scale, onBoxesChange]);

    const startDrag = (e: React.MouseEvent, key: string) => {
      e.preventDefault(); e.stopPropagation();
      const rect = scrollRef.current!.getBoundingClientRect();
      setDrag({ key, dx: (e.clientX - rect.left) / scale - boxes[key].x, dy: (e.clientY - rect.top) / scale - boxes[key].y });
      onActiveKeyChange(key);
    };
    const startResize = (e: React.MouseEvent, key: string) => {
      e.preventDefault(); e.stopPropagation();
      const rect = scrollRef.current!.getBoundingClientRect();
      setResize({ key, startX: (e.clientX - rect.left) / scale, startY: (e.clientY - rect.top) / scale, startW: boxes[key].w, startH: boxes[key].h });
      onActiveKeyChange(key);
    };

    return (
      <div className="aspect-[4/3] rounded-md border overflow-auto bg-muted/30" ref={scrollRef}>
        <div
          className="relative"
          style={{ width: BASE_W * scale, height: BASE_H * scale, transform: flipped ? "scaleX(-1)" : undefined }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Bill document with annotations"
              className="absolute inset-0"
              style={{ width: BASE_W * scale, height: BASE_H * scale, objectFit: "contain" }}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No image available</div>
          )}

          {Object.entries(boxes).map(([key, b]) => (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`Annotation ${key}`}
              onDoubleClick={() => onDoubleEdit?.(key)}
              onMouseDown={(e) => startDrag(e, key)}
              className={`absolute border-2 rounded-sm ${activeKey === key ? "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/.25)]" : "border-primary/50"}`}
              style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale, cursor: "move" }}
            >
              <div
                className={handleCls}
                onMouseDown={(e) => startResize(e, key)}
                aria-label="Resize handle"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
);

BillAnnotator.displayName = "BillAnnotator";

export default BillAnnotator;
