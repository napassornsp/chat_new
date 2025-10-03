// src/pages/Profile.tsx
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Upload, Save, Crown, Shield, Building2, Info } from "lucide-react";

type MeResponse = {
  id: number;
  email: string;
  name: string;
  profile?: { full_name?: string; avatar_url?: string | null };
};

type CreditsPayload = {
  plan: "free" | "plus" | "business" | "admin";
  chat: { limit: number; remaining: number; used: number; percent_used: number };
  ocr_bill: { limit: number; remaining: number; used: number; percent_used: number };
  ocr_bank: { limit: number; remaining: number; used: number; percent_used: number };
  last_reset_at?: string | null;
};

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";
// TODO: set to your real checkout URL when you have one
const BILLING_URL = "/billing";

function authHeaders() {
  const token = localStorage.getItem("offline_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

/* ---------- tiny UI helpers ---------- */
function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-sm font-medium mb-3 ${className}`}>{children}</h2>;
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-gradient-to-r from-primary to-cyan-400" style={{ width: `${v}%` }} />
    </div>
  );
}
/* ------------------------------------ */

export default function Profile() {
  const { toast } = useToast();

  // profile state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // optional UI-only fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");

  // plan/credits
  const [credits, setCredits] = useState<CreditsPayload | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const currentPlan = credits?.plan ?? "free";
  const isAdmin = currentPlan === "admin" || email === "admin@example.com";

  // ---------- profile ----------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/me`, { headers: authHeaders() });
        const data = (await r.json()) as MeResponse;
        setEmail(data.email ?? "");
        setUsername(data.name ?? "");
        setFullName(data.profile?.full_name ?? "");
        setAvatarUrl((data.profile?.avatar_url as string) ?? null);
      } catch {
        toast({ title: "Failed to load profile", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- credits ----------
  async function fetchCredits() {
    try {
      const r = await fetch(`${API}/rpc/get_credits`, { method: "POST", headers: authHeaders() });
      const d = await r.json();
      setCredits(d?.data?.credits ?? null);
    } catch {
      // ignore
    }
  }
  useEffect(() => {
    fetchCredits();
    const refresh = () => fetchCredits();
    window.addEventListener("credits:refresh", refresh);
    window.addEventListener("ocr:credits-changed", refresh);
    return () => {
      window.removeEventListener("credits:refresh", refresh);
      window.removeEventListener("ocr:credits-changed", refresh);
    };
  }, []);

  // ---------- actions ----------
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        name: username,
        full_name: fullName || `${firstName} ${lastName}`.trim(),
        avatar_url: avatarUrl,
      };
      const r = await fetch(`${API}/me`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function onAvatarPick(file: File) {
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function upgradeTo(plan: "plus" | "business") {
    // Offline: simulate change; replace with real checkout later.
    if (plan === "plus") {
      window.location.href = BILLING_URL; // go to purchase page
      return;
    }
    if (plan === "business") {
      setContactOpen(true); // open contact modal
      return;
    }
  }

  const initials = useMemo(() => {
    const src = fullName || username || email || "";
    const parts = src.trim().split(/\s+/);
    const first = (parts[0] || "").charAt(0);
    const second = (parts[1] || "").charAt(0);
    return (first + second).toUpperCase() || "U";
  }, [fullName, username, email]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-32 rounded bg-muted animate-pulse mb-4" />
        <div className="h-80 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 h-[calc(100vh-60px)]"> {/* take available height under app header */}
      {/* Header (no extra top tab) */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account, credits and plan.</p>
      </div>

      {/* Layout: left column is account; right column scrolls */}
      <form
        onSubmit={onSave}
        className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[calc(100%-56px)]"
      >
        {/* LEFT COLUMN ----------------------------------------------------- */}
        <section className="xl:col-span-1 space-y-6 overflow-y-auto pr-1">
          {/* Account */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Account</SectionTitle>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 rounded-xl overflow-hidden border bg-muted flex items-center justify-center text-xl font-semibold">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onAvatarPick(e.target.files[0])}
                  />
                  <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-muted">
                    <Upload className="h-4 w-4" />
                    Upload photo
                  </span>
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="text-xs text-muted-foreground underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs uppercase text-muted-foreground">Email</label>
              <input value={email} disabled className="mt-1 w-full rounded-md border px-3 py-2 bg-muted" />
            </div>
          </div>

          {/* Credits (TOP of plans) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Credits remaining</SectionTitle>

            {isAdmin ? (
              <div className="text-sm text-muted-foreground">Unlimited (admin)</div>
            ) : (
              <>
                <Bucket
                  title="Chat credits"
                  value={credits?.chat.remaining ?? 0}
                  limit={credits?.chat.limit ?? 0}
                  usedPct={credits?.chat.percent_used ?? 0}
                />
                <Bucket
                  title="OCR: Bill"
                  className="mt-3"
                  value={credits?.ocr_bill.remaining ?? 0}
                  limit={credits?.ocr_bill.limit ?? 0}
                  usedPct={credits?.ocr_bill.percent_used ?? 0}
                />
                <Bucket
                  title="OCR: Bank"
                  className="mt-3"
                  value={credits?.ocr_bank.remaining ?? 0}
                  limit={credits?.ocr_bank.limit ?? 0}
                  usedPct={credits?.ocr_bank.percent_used ?? 0}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Counters reset automatically each month. Last reset:&nbsp;
                  {credits?.last_reset_at ? new Date(credits.last_reset_at).toLocaleDateString() : "–"}
                </p>

                <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <Info className="h-3.5 w-3.5" />
                    Usage rules
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <span className="font-medium">Chat versions:</span> V1 costs <b>1</b> credit/message, V2 costs{" "}
                      <b>2</b>, V3 costs <b>3</b>.
                    </li>
                    <li>
                      <span className="font-medium">OCR</span> charges 1 credit when you click <b>Analyze</b>. Bill and
                      Bank are tracked separately.
                    </li>
                    <li>All counters reset monthly (automatic—no manual reset).</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Plan (below credits) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Current plan</SectionTitle>
            <div className="space-y-3">
              {/* Free */}
              <PlanRow
                active={isAdmin ? false : currentPlan === "free"}
                icon={<Shield className="h-4 w-4" />}
                title="Free"
                subtitle="Good for getting started."
                bullets={["Chat 100 per month", "OCR Bill 3 / OCR Bank 3 per month"]}
                rightBadge={!isAdmin && currentPlan === "free" ? <Badge>Current plan</Badge> : null}
                action={
                  !isAdmin && currentPlan === "free" ? (
                    <button
                      type="button"
                      onClick={() => upgradeTo("plus")}
                      className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
                    >
                      Purchase Plus
                    </button>
                  ) : null
                }
              />

              {/* Plus */}
              <PlanRow
                active={currentPlan === "plus"}
                icon={<Crown className="h-4 w-4" />}
                title="Plus"
                subtitle="More headroom for power users."
                bullets={["Chat 500 per month", "OCR Bill 20 / OCR Bank 20 per month"]}
                rightBadge={!isAdmin && currentPlan === "plus" ? <Badge>Current plan</Badge> : null}
                action={
                  !isAdmin && currentPlan !== "plus" ? (
                    <button
                      type="button"
                      onClick={() => upgradeTo("plus")}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Purchase
                    </button>
                  ) : null
                }
              />

              {/* Business */}
              <PlanRow
                active={currentPlan === "business"}
                icon={<Building2 className="h-4 w-4" />}
                title="Business"
                subtitle="Adjustable limits and support."
                bullets={["Higher adjustable limits", "Priority help & advice"]}
                rightBadge={!isAdmin && currentPlan === "business" ? <Badge>Current plan</Badge> : null}
                action={
                  !isAdmin ? (
                    <button
                      type="button"
                      onClick={() => upgradeTo("business")}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Contact sales
                    </button>
                  ) : null
                }
              />

              {isAdmin && (
                <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                  Admin account: unlimited credits for all tasks.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (scrollable) ------------------------------------- */}
        <section className="xl:col-span-2 space-y-6 overflow-y-auto pr-1">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Profile Information</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Username (Display name)</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. jane_doe"
                />
              </div>
              <div>
                <label className="text-sm">Full Name</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label className="text-sm">First Name</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="text-sm">Last Name</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm">Website</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm">About</label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 min-h-[96px] resize-y"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="Brief bio or role…"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {/* Security (visual only) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Security</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm">Old Password</label>
                <input
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm">New Password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              (Visual only) Wire this to a Flask endpoint when you’re ready to change passwords.
            </p>
          </div>
        </section>
      </form>

      {/* Contact sales modal */}
      {contactOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => setContactOpen(false)}
        >
          <div
            className="w-[92vw] max-w-lg rounded-xl bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Contact sales</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us a bit about your needs and we’ll reach out.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                // simulate submit
                setContactOpen(false);
                // show toast?
                toast({ title: "Thanks! We’ll be in touch shortly." });
              }}
            >
              <div>
                <label className="text-sm">Company / Team</label>
                <input className="mt-1 w-full rounded-md border px-3 py-2" required />
              </div>
              <div>
                <label className="text-sm">Message</label>
                <textarea className="mt-1 w-full rounded-md border px-3 py-2 min-h-[96px]" required />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => setContactOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */
function PlanRow({
  active,
  icon,
  title,
  subtitle,
  bullets,
  rightBadge,
  action,
}: {
  active?: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bullets: string[];
  rightBadge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 ${active ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rightBadge}
          {action}
        </div>
      </div>
      <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5 space-y-1">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

function Bucket({
  title,
  value,
  limit,
  usedPct,
  className = "",
}: {
  title: string;
  value: number;
  limit: number;
  usedPct: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">
          {value}/{limit}
        </span>
      </div>
      <Progress value={usedPct} />
    </div>
  );
}
