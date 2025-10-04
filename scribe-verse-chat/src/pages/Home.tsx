import { Helmet } from "react-helmet-async";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, type MotionProps } from "framer-motion";
import {
  MapPin,
  Sparkles,
  ShieldCheck,
  Search,
  Landmark,
  Building2,
  Factory,
  Banknote,
} from "lucide-react";

/* ───────────────── helpers ───────────────── */

const fadeUp = (i = 0): MotionProps => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.5, delay: 0.06 * i, ease: "easeOut" },
});

type Msg = { side: "me" | "them"; text: string };

/** word-by-word chat animation that loops */
function useWordConversation(
  messages: Msg[],
  wordSpeed = 110,
  afterMsgDelay = 260,
  loopDelay = 1100
) {
  const [shown, setShown] = useState<Msg[]>([]);
  const [msgIdx, setMsgIdx] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [partial, setPartial] = useState("");

  useEffect(() => {
    let t: any;
    if (msgIdx >= messages.length) {
      t = setTimeout(() => {
        setShown([]);
        setMsgIdx(0);
        setWordIdx(0);
        setPartial("");
      }, loopDelay);
      return () => clearTimeout(t);
    }
    const words = messages[msgIdx].text.trim().split(/\s+/);
    if (wordIdx <= words.length) {
      setPartial(words.slice(0, wordIdx).join(" "));
      t = setTimeout(() => setWordIdx((w) => w + 1), wordSpeed);
    } else {
      t = setTimeout(() => {
        setShown((s) => [...s, messages[msgIdx]]);
        setMsgIdx((k) => k + 1);
        setWordIdx(0);
        setPartial("");
      }, afterMsgDelay);
    }
    return () => clearTimeout(t);
  }, [messages, msgIdx, wordIdx, wordSpeed, afterMsgDelay, loopDelay]);

  const typingFor = msgIdx < messages.length ? messages[msgIdx] : null;
  return { shown, typingFor, partial };
}

/* ───────────────── Clients: square full-bleed color cards ───────────────── */

type Tone = "sky" | "aqua" | "mint";

const toneGrad: Record<Tone, [string, string]> = {
  sky: ["#38bdf8", "#2563eb"],
  aqua: ["#22d3ee", "#06b6d4"],
  mint: ["#34d399", "#0ea5a4"],
};

function HandshakeBadge({ size = 84 }: { size?: number }) {
  // Simplified badge + check + handshake, inspired by your reference
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      {/* badge */}
      <defs>
        <linearGradient id="gBadge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a21caf" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="34" r="22" fill="url(#gBadge)" />
      {/* check */}
      <path
        d="M40 34l5 5 11-12"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* handshake */}
      <rect x="20" y="52" width="16" height="10" rx="2" fill="#0f172a" />
      <path d="M30 50c6 0 8 7 14 7 4 0 7-2 9-5l6 5c-3 6-9 9-15 9-9 0-15-7-18-13z" fill="#eab08f" />
      <rect x="60" y="52" width="16" height="10" rx="2" fill="#0f172a" />
      <path d="M66 50c-6 0-8 7-14 7-4 0-7-2-9-5l-6 5c3 6 9 9 15 9 9 0 15-7 18-13z" fill="#d69b7c" />
    </svg>
  );
}

type FlipCardProps = {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  height?: string;
};

function FlipCard({ front, back, className = "", height = "h-44" }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);

  return (
    <div
      className={["relative cursor-pointer select-none", height, className].join(" ")}
      style={{ perspective: 1000 }}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
    >
      <div
        className="absolute inset-0 transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT: full-bleed gradient block, square corners */}
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          {front}
        </div>
        {/* BACK: full-bleed gradient block with the name */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}

function ColorFront({ tone = "sky" as Tone }) {
  const [c0, c1] = toneGrad[tone];
  return (
    <div
      className="h-full w-full grid place-items-center"
      style={{ background: `linear-gradient(145deg, ${c0}, ${c1})` }}
    >
      <HandshakeBadge />
    </div>
  );
}

function ColorBack({
  name,
  tone = "sky" as Tone,
  icon,
}: {
  name: string;
  tone?: Tone;
  icon: React.ReactNode;
}) {
  const [c0, c1] = toneGrad[tone];
  return (
    <div
      className="h-full w-full grid place-items-center"
      style={{ background: `linear-gradient(145deg, ${c0}, ${c1})` }}
    >
      <div className="grid gap-3 justify-items-center text-white">
        <div className="h-12 w-12 grid place-items-center rounded-full bg-white/20">{icon}</div>
        <div className="font-semibold text-center">{name}</div>
      </div>
    </div>
  );
}

function ClientFlip({
  name,
  icon,
  tone = "sky",
}: {
  name: string;
  icon: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <FlipCard
      className="w-full"
      height="h-44"
      front={<ColorFront tone={tone} />}
      back={<ColorBack name={name} tone={tone} icon={icon} />}
    />
  );
}

/* ───────────────── OCR (wider) ───────────────── */

function OcrDemo() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const id = setInterval(() => setProgress((p) => (p >= 100 ? (clearInterval(id), 100) : p + 2)), 26);
    return () => clearInterval(id);
  }, []);

  const rows = [
    { time: "01-01-22 09:47", desc: "ฝากเงิน", amount: "5,850.00", side: "CR" },
    { time: "01-01-22 17:04", desc: "รับโอนเงิน", amount: "10,000.00", side: "CR" },
    { time: "02-01-22 02:53", desc: "ค่าธรรมเนียม", amount: "265.00", side: "DR" },
    { time: "03-01-22 14:54", desc: "โอนเงินออก", amount: "2,000,000.00", side: "DR" },
  ];

  return (
    <div className="h-full rounded-2xl border bg-white shadow-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 p-3 text-slate-800 font-semibold">
        <Banknote className="h-4 w-4 text-sky-600" />
        OCR
      </div>

      <div className="px-4 -mt-2 mb-1">
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600"
            style={{ width: `${progress}%` }}
            initial={{ width: 0 }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,2fr] gap-4 p-4 pt-0">
        {/* Input image (small) */}
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="relative overflow-hidden rounded-lg border bg-white">
            <div className="px-3 pt-3">
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 rounded bg-emerald-500/90" />
                <div className="h-6 w-6 rounded-full bg-emerald-400" />
              </div>
            </div>
            <div className="p-3">
              <div className="h-20 rounded bg-slate-50 border mb-2" />
              <div className="grid grid-cols-6 gap-px bg-slate-200 rounded">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="h-5 bg-white" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Output table (wider) */}
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="overflow-hidden rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Dr / Cr</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <motion.tr
                    key={r.time + i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="odd:bg-white even:bg-slate-50/40"
                  >
                    <td className="px-3 py-2">{r.time}</td>
                    <td className="px-3 py-2">{r.desc}</td>
                    <td className="px-3 py-2 text-right">{r.amount}</td>
                    <td className="px-3 py-2 text-center">{r.side}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* centered CTA inside */}
      <div className="pb-5 flex justify-center mt-auto">
        <button
          onClick={() => navigate("/ocr/bill")}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 border border-sky-200/50 shadow-[0_6px_18px_-4px_rgba(56,189,248,.55)]"
        >
          <Search className="h-4 w-4" />
          Open OCR Demo
        </button>
      </div>
    </div>
  );
}

/* ───────────────── Vision (cute multi; faster sweep) ───────────────── */

type Target = { kind: "robot" | "person" | "pet"; cx: number };

function VisionCuteMulti() {
  const navigate = useNavigate();
  const targets: Target[] = useMemo(
    () => [
      { kind: "robot", cx: 60 },
      { kind: "person", cx: 135 },
      { kind: "robot", cx: 205 },
      { kind: "pet", cx: 275 },
      { kind: "robot", cx: 345 },
    ],
    []
  );

  const [x, setX] = useState(-120);
  const [detKind, setDetKind] = useState<Target["kind"] | null>(null);
  const [detCx, setDetCx] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let pauseUntil = 0;
    const tick = (t: number) => {
      if (pauseUntil && t < pauseUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }
      pauseUntil = 0;

      setX((prev) => {
        const next = prev + 7.4; // faster
        const center = next + 45;
        const hit = targets.find((tg) => center > tg.cx - 35 && center < tg.cx + 35);
        if (hit) {
          setDetKind(hit.kind);
          setDetCx(hit.cx);
          pauseUntil = t + 320;
        } else {
          setDetKind(null);
          setDetCx(null);
        }
        return next > 400 ? -120 : next;
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targets]);

  return (
    <div className="h-full rounded-2xl border bg-white shadow-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 p-3 text-slate-800 font-semibold">
        <Factory className="h-4 w-4 text-sky-600" />
        Vision AI
      </div>

      <div className="p-3">
        <svg viewBox="0 0 400 280" className="w-full h-80 rounded-xl overflow-hidden">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id="face" x1="0" x2="1">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
            <linearGradient id="shell3d" x1="0" x2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e5e7eb" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="400" height="280" fill="url(#bg)" />
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={"v" + i} x1={i * 45} y1="0" x2={i * 45} y2="280" stroke="#e2e8f0" />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={"h" + i} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="#e2e8f0" />
          ))}

          {targets.map((tg, i) => {
            if (tg.kind === "robot") {
              return (
                <g key={i}>
                  <rect x={tg.cx - 18} y={105} width="36" height="28" rx="8" fill="url(#shell3d)" />
                  <rect x={tg.cx - 14} y={110} width="28" height="18" rx="6" fill="#0f172a" />
                  <rect x={tg.cx - 10} y={114} width="9" height="8" rx="2" fill="url(#face)" />
                  <rect x={tg.cx + 1} y={114} width="9" height="8" rx="2" fill="url(#face)" />
                  <rect x={tg.cx - 14} y={150} width="28" height="52" rx="10" fill="url(#shell3d)" />
                  <circle cx={tg.cx - 22} cy={160} r="6" fill="#60a5fa" />
                  <circle cx={tg.cx + 22} cy={160} r="6" fill="#60a5fa" />
                  {detCx === tg.cx && detKind === "robot" && (
                    <>
                      <circle cx={tg.cx} cy={140} r="52" fill="none" stroke="rgba(34,197,94,.35)" strokeWidth="6" />
                      <circle cx={tg.cx} cy={195} r="7" fill="#67e8f9">
                        <animate attributeName="r" values="7;10;7" dur="0.8s" repeatCount="indefinite" />
                      </circle>
                    </>
                  )}
                </g>
              );
            }
            if (tg.kind === "person") {
              return (
                <g key={i}>
                  <circle cx={tg.cx} cy={130} r="20" fill="#94a3b8" />
                  <rect x={tg.cx - 16} y="160" width="32" height="56" rx="8" fill="#64748b" />
                  <circle cx={tg.cx - 6} cy={138} r="3" fill="#0ea5e9" />
                  <circle cx={tg.cx + 6} cy={138} r="3" fill="#0ea5e9" />
                </g>
              );
            }
            return (
              <g key={i}>
                <circle cx={tg.cx} cy={133} r="16" fill="#22c55e" />
                <polygon points={`${tg.cx - 10},124 ${tg.cx - 4},116 ${tg.cx - 2},128`} fill="#16a34a" />
                <polygon points={`${tg.cx + 10},124 ${tg.cx + 4},116 ${tg.cx + 2},128`} fill="#16a34a" />
                <rect x={tg.cx - 14} y="148" width="28" height="44" rx="8" fill="#16a34a" />
              </g>
            );
          })}

          {/* scanner */}
          <rect
            x={x}
            y={75}
            width={90}
            height={170}
            rx="3"
            ry="3"
            fill="transparent"
            stroke={detKind === "robot" ? "#22c55e" : detKind ? "#f59e0b" : "#2563eb"}
            strokeWidth="3"
          />
          <rect
            x={x}
            y={75}
            width={90}
            height={170}
            rx="3"
            ry="3"
            fill="transparent"
            stroke={
              detKind === "robot"
                ? "rgba(34,197,94,.22)"
                : detKind
                ? "rgba(245,158,11,.22)"
                : "rgba(37,99,235,.2)"
            }
            strokeWidth="8"
          />
          <g>
            <rect
              x={x + 4}
              y={58}
              rx="4"
              ry="4"
              width={120}
              height="16"
              fill={detKind === "robot" ? "#22c55e" : detKind ? "#f59e0b" : "#2563eb"}
            />
            <text x={x + 8} y={70} fontSize="9" fill="#ffffff">
              {detKind === "robot" ? "robot 0.97" : detKind ? `${detKind} — not robot` : "scanning…"}
            </text>
          </g>
        </svg>

        {/* centered CTA inside */}
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => navigate("/vision/flower-classification")}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 border border-sky-200/50 shadow-[0_6px_18px_-4px_rgba(56,189,248,.55)]"
          >
            <Sparkles className="h-4 w-4" />
            Open Vision Demo
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Chat (button pinned at the bottom INSIDE the box) ───────────────── */

function ChatPreviewFramed() {
  const navigate = useNavigate();
  const thread: Msg[] = [
    { side: "me", text: "Hello" },
    { side: "them", text: "Good morning Mr. XX" },
    { side: "me", text: "What are the materials to build this X product?" },
    {
      side: "them",
      text:
        "The materials are structural steel for the frame, aluminum for enclosure parts, tempered glass panels, silicone sealant, and stainless fasteners.",
    },
  ];
  const { shown, typingFor, partial } = useWordConversation(thread, 110, 260, 1000);

  return (
    <section className="container pb-8">
      <div className="rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 p-3 text-slate-800 font-semibold">
          <ShieldCheck className="h-4 w-4 text-sky-600" />
          Chat
        </div>

        {/* Fixed-height inner frame; CTA pinned absolute at bottom */}
        <div className="relative m-4 rounded-2xl border bg-white/80 shadow-inner h-[360px] md:h-[380px]">
          <div className="absolute inset-0 flex flex-col">
            {/* messages area (leave extra bottom padding so button never overlaps) */}
            <div className="flex-1 overflow-hidden p-4 pb-20">
              <div className="space-y-3">
                {shown.map((m, idx) => (
                  <div key={idx} className={m.side === "me" ? "text-right" : "text-left"}>
                    <span
                      className={[
                        "inline-block rounded-3xl px-4 py-2 shadow",
                        m.side === "me" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-800",
                      ].join(" ")}
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {typingFor && (
                  <div className={typingFor.side === "me" ? "text-right" : "text-left"}>
                    <span
                      className={[
                        "inline-block rounded-3xl px-4 py-2 shadow",
                        typingFor.side === "me" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-800",
                      ].join(" ")}
                    >
                      {partial}
                      <span className="inline-block w-2 h-4 align-middle ml-1 bg-sky-400/80 animate-pulse rounded-sm" />
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* CTA pinned to bottom, with a little gap from the border */}
            <div className="absolute left-0 right-0 bottom-0 flex justify-center mb-3">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-white bg-gradient-to-r from-cyan-500 to-blue-600 border border-sky-200/50 shadow-[0_6px_18px_-4px_rgba(56,189,248,.55)]"
              >
                <ShieldCheck className="h-4 w-4" />
                Open Chatbot
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────── Company location (small chips + map) ───────────────── */

function CompanyLocation() {
  const branches = {
    bkk: {
      key: "bkk",
      title: "Bangkok",
      address: "83/28 Samwa 20 Bangchan Klong Samwa Bangkok 10510",
      iframe: `https://www.google.com/maps?q=${encodeURIComponent(
        "https://www.google.com/maps/place/20+%E0%B8%96%E0%B8%99%E0%B8%99+%E0%B8%AA%E0%B8%B2%E0%B8%A1%E0%B8%A7%E0%B8%B2+%E0%B9%81%E0%B8%82%E0%B8%A7%E0%B8%87%E0%B8%9A%E0%B8%B2%E0%B8%87%E0%B8%8A%E0%B8%B1%E0%B8%99+%E0%B9%80%E0%B8%82%E0%B8%95%E0%B8%84%E0%B8%A5%E0%B8%AD%E0%B8%87%E0%B8%AA%E0%B8%B2%E0%B8%A1%E0%B8%A7%E0%B8%B2+%E0%B8%81%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B9%80%E0%B8%97%E0%B8%9E%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%99%E0%B8%84%E0%B8%A3+10510/@13.8431131,100.7247762,17z"
      )}&z=16&output=embed`,
    },
    korat: {
      key: "korat",
      title: "Nakhon Ratchasima",
      address: "23/4 Water wheel park moo 2 Khanong Phra, Pak Chong, Nakhon Ratchasima",
      iframe: `https://www.google.com/maps?q=${encodeURIComponent(
        "https://www.google.com/maps/place/%E0%B8%A7%E0%B8%AD%E0%B9%80%E0%B8%95%E0%B8%AD%E0%B8%A3%E0%B9%8C%E0%B8%A7%E0%B8%B5%E0%B8%A5%E0%B8%9E%E0%B8%B2%E0%B8%A3%E0%B9%8C%E0%B8%84/@14.6249708,101.4333548,18z"
      )}&z=17&output=embed`,
    },
  } as const;

  type BranchKey = keyof typeof branches;
  const [active, setActive] = useState<BranchKey>("bkk");

  const chip =
    "inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70";

  return (
    <section className="container pb-16">
      <div className="rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 p-3 text-slate-800 font-semibold">
          <MapPin className="h-4 w-4 text-sky-600" />
          Company location
        </div>

        <div className="p-3">
          <div className="flex flex-wrap gap-2 mb-3">
            {(["bkk", "korat"] as BranchKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={[
                  chip,
                  active === k
                    ? "text-white bg-gradient-to-r from-cyan-500 to-blue-600 border-sky-200/50"
                    : "text-sky-800 border-sky-300/60 bg-sky-50 hover:bg-sky-100",
                ].join(" ")}
                aria-pressed={active === k}
              >
                <MapPin className="h-4 w-4" />
                {branches[k].title}
              </button>
            ))}
          </div>

          {/* Addresses sub-box (as requested) */}
          <div className="grid gap-3 md:grid-cols-2 mb-3">
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-sm font-semibold text-slate-800 mb-1">Bangkok Branch</div>
              <div className="text-sm text-slate-600">{branches.bkk.address}</div>
            </div>
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-sm font-semibold text-slate-800 mb-1">Nakhon Ratchasima Branch</div>
              <div className="text-sm text-slate-600">{branches.korat.address}</div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="aspect-[16/9] rounded-xl overflow-hidden border-2 border-sky-300 shadow-[0_20px_60px_-20px_rgba(56,189,248,0.25)] bg-white"
            >
              <iframe
                title={branches[active].title}
                className="w-full h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={branches[active].iframe}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ───────────────── Page ───────────────── */

export default function Home() {
  const canonical = typeof window !== "undefined" ? `${window.location.origin}/home` : "";

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-white">
      <Helmet>
        <title>JV System | Home</title>
        <meta name="description" content="JV System — Chat, OCR, Vision and Locations with smooth animations." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      {/* Headline */}
      <section className="container pt-10 pb-4">
        <motion.h1
          className="text-4xl md:text-6xl font-black leading-[1.05] text-slate-900 tracking-tight"
          {...fadeUp()}
        >
          From{" "}
          <span className="bg-gradient-to-r from-cyan-500 to-sky-600 bg-clip-text text-transparent">documents</span> to{" "}
          <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
            financial statements
          </span>
          <span className="ml-3 text-slate-900">— built for Thailand</span>
        </motion.h1>
        <motion.p className="mt-3 text-slate-500 text-lg" {...fadeUp(1)}>
          Not just OCR — assistants, NER and Vision work together for faster, more accurate operations.
        </motion.p>
      </section>

      {/* Chat with button pinned inside */}
      <ChatPreviewFramed />

      {/* OCR (wider) + Vision (bigger) */}
      <section className="container grid gap-6 lg:grid-cols-[3fr,2fr] items-stretch pb-10">
        <motion.div {...fadeUp(2)}>
          <OcrDemo />
        </motion.div>
        <motion.div {...fadeUp(3)}>
          <VisionCuteMulti />
        </motion.div>
      </section>

      {/* Clients — front = icon only ; flip to reveal name */}
      <section className="container pb-10">
        <motion.div className="rounded-2xl border bg-white p-6 shadow-xl" {...fadeUp(4)}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Our Clients</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ClientFlip name="Inthorn Company Limited" icon={<Landmark className="h-5 w-5" />} tone="sky" />
            <ClientFlip name="Breuning Company Limited" icon={<Building2 className="h-5 w-5" />} tone="aqua" />
            <ClientFlip name="BAFS" icon={<Factory className="h-5 w-5" />} tone="mint" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Tip: click a card to flip.</p>
        </motion.div>
      </section>

      {/* Locations */}
      <CompanyLocation />
    </main>
  );
}
