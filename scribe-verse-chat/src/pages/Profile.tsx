// src/pages/Profile.tsx
import { useEffect, useMemo, useState } from "react";
import { Crown, Shield, Building2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ----------------------------- Types & constants ---------------------------- */

type MeResponse = {
  id: number;
  email: string;
  name: string;
};

type CreditBucket = { limit: number | null; remaining: number | null; used: number; percent_used: number | null };
type CreditsPayload = {
  plan: "free" | "plus" | "business" | "admin";
  last_reset_at?: string | null;
  chat: CreditBucket;
  ocr_bill: CreditBucket;
  ocr_bank: CreditBucket;
};

const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";

function authHeaders() {
  const token = localStorage.getItem("offline_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

/* -------------------------------- UI helpers ------------------------------- */

function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={`text-sm font-medium mb-3 ${className}`}>{children}</h2>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/** Remaining (dark) over Used (light) dual bar */
function RemainingBar({ limit, remaining }: { limit: number | null; remaining: number | null }) {
  if (limit === null || remaining === null) {
    // contract-based / unlimited – show full bar with em dash
    return (
      <div className="relative h-2 w-full rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-muted" />
        <div className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: `100%` }} />
        <div className="absolute inset-0 ring-1 ring-black/5 rounded-full pointer-events-none" />
      </div>
    );
  }
  const lim = Math.max(0, limit);
  const rem = Math.max(0, Math.min(remaining, lim));
  const remPct = lim > 0 ? Math.round((rem / lim) * 100) : 0;
  return (
    <div className="relative h-2 w-full rounded-full overflow-hidden">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: `${remPct}%` }} />
      <div className="absolute inset-0 ring-1 ring-black/5 rounded-full pointer-events-none" />
    </div>
  );
}

/* --------------------------------- Page ------------------------------------ */

export default function Profile() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  // password change
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // plan/credits
  const [credits, setCredits] = useState<CreditsPayload | null>(null);

  // Sales modal state (shared for Plus & Business)
  const [contactOpen, setContactOpen] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [desiredPlan, setDesiredPlan] = useState<"plus" | "business">("plus");
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cLocation, setCLocation] = useState("");
  const [cMsg, setCMsg] = useState("");

  const currentPlan = credits?.plan ?? "free";
  const isAdmin = currentPlan === "admin" || email === "admin@example.com";

  /* ----------------------------- Load profile ------------------------------ */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/me`, { headers: authHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as MeResponse;
        setEmail(data.email ?? "");
      } catch (e: any) {
        toast({ title: "Failed to load profile", description: String(e?.message ?? e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----------------------------- Load credits ------------------------------ */
  async function fetchCredits() {
    try {
      const r = await fetch(`${API}/rpc/get_credits`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
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

  /* -------------------------------- Actions -------------------------------- */
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPw || !newPw) {
      toast({ title: "Enter both old and new password", variant: "destructive" });
      return;
    }
    setChangingPw(true);
    try {
      const r = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body?.error) {
        throw new Error(body?.error || `HTTP ${r.status}`);
      }
      toast({ title: "Password changed" });
      setOldPw("");
      setNewPw("");
    } catch (err: any) {
      toast({
        title: "Password change failed",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setChangingPw(false);
    }
  }

  const initials = useMemo(() => {
    const src = email || "";
    const first = src.trim().charAt(0);
    return (first || "U").toUpperCase();
  }, [email]);

  /* --------------------------------- Render -------------------------------- */

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-32 rounded bg-muted animate-pulse mb-4" />
        <div className="h-80 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  function submitContactSales() {
    throw new Error("Function not implemented.");
  }

  return (
    <div className="px-6 py-4 h-[calc(100vh-60px)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account, credits and plan.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[calc(100%-56px)]">
        {/* LEFT: Account (email only) + password ------------------------------ */}
        <section className="xl:col-span-1 space-y-6 overflow-y-auto pr-1">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Account</SectionTitle>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted grid place-items-center font-semibold">
                {initials}
              </div>
              <div className="flex-1">
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Email</label>
                  <input value={email} disabled className="mt-1 w-full rounded-md border px-3 py-2 bg-muted" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Change password</SectionTitle>
            <form className="grid grid-cols-1 gap-3" onSubmit={changePassword}>
              <div>
                <label className="text-sm">Old Password</label>
                <input
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  placeholder="Current password"
                />
              </div>
              <div>
                <label className="text-sm">New Password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  placeholder="New password"
                />
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={changingPw}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                >
                  {changingPw ? "Updating…" : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* RIGHT: Credits + Plans ---------------------------------------------- */}
        <section className="xl:col-span-2 space-y-6 overflow-y-auto pr-1">
          {/* Credits */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Credits remaining</SectionTitle>

            {isAdmin ? (
              <div className="text-sm text-muted-foreground">Unlimited (admin)</div>
            ) : (
              <>
                <Bucket
                  title="Chat credits"
                  remaining={credits?.chat.remaining ?? null}
                  limit={credits?.chat.limit ?? null}
                />
                <Bucket
                  title="OCR: Bill"
                  className="mt-3"
                  remaining={credits?.ocr_bill.remaining ?? null}
                  limit={credits?.ocr_bill.limit ?? null}
                />
                <Bucket
                  title="OCR: Bank"
                  className="mt-3"
                  remaining={credits?.ocr_bank.remaining ?? null}
                  limit={credits?.ocr_bank.limit ?? null}
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
                    <li>All counters reset monthly.</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Current plan card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <SectionTitle>Current plan</SectionTitle>

            <div className="space-y-3">
              {currentPlan === "free" && (
                <PlanRow
                  active
                  icon={<Shield className="h-4 w-4" />}
                  title="Free"
                  subtitle="Good for getting started."
                  bullets={["Chat 100 per month", "OCR Bill 3 / OCR Bank 3 per month"]}
                  rightBadge={<Badge>Current plan</Badge>}
                />
              )}
              {currentPlan === "plus" && (
                <PlanRow
                  active
                  icon={<Crown className="h-4 w-4" />}
                  title="Plus"
                  subtitle="More headroom for power users."
                  bullets={["Chat 1000 per month", "OCR Bill 100 / OCR Bank 100 per month"]}
                  rightBadge={<Badge>Current plan</Badge>}
                />
              )}
              {currentPlan === "business" && (
                <PlanRow
                  active
                  icon={<Building2 className="h-4 w-4" />}
                  title="Business"
                  subtitle="Contract-based limits."
                  bullets={["Limits defined in your contract", "Priority assistance"]}
                  rightBadge={<Badge>Current plan</Badge>}
                />
              )}
              {isAdmin && (
                <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                  Admin account: unlimited credits for all tasks.
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {!isAdmin && currentPlan !== "plus" && (
            <ActionRow
              icon={<Crown className="h-4 w-4" />}
              title="Upgrade to Plus"
              description="Talk to a person and complete purchase."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setDesiredPlan("plus");
                    setCEmail(email || "");
                    setCMsg("I’d like to purchase the Plus plan.");
                    setContactOpen(true);
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Contact sales
                </button>
              }
            />
          )}

          {!isAdmin && currentPlan !== "business" && (
            <ActionRow
              icon={<Building2 className="h-4 w-4" />}
              title="Contact Sales for Business"
              description="Talk to a person to tailor limits and support."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setDesiredPlan("business");
                    setCEmail(email || "");
                    setCMsg("I’m interested in the Business plan and tailored limits.");
                    setContactOpen(true);
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Contact sales
                </button>
              }
            />
          )}
        </section>
      </div>

      {/* Shared Contact/Purchase modal for Plus & Business */}
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
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <h3 className="text-lg font-semibold">
                {desiredPlan === "plus" ? "Contact Sales – Plus" : "Contact Sales – Business"}
              </h3>
            </div>

            <p className="text-sm text-muted-foreground">
              Prefer phone? Call <b>081-XXXXXX</b>. Company: <b>YourCo Ltd.</b>, Location:{" "}
              <b>Bangkok, Thailand</b>.
            </p>

            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitContactSales();
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Your name</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm">Email</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Phone</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    placeholder="081-xxxxxxx"
                  />
                </div>
                <div>
                  <label className="text-sm">Company</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={cCompany}
                    onChange={(e) => setCCompany(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm">Location</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={cLocation}
                  onChange={(e) => setCLocation(e.target.value)}
                  placeholder="City / Country"
                />
              </div>

              <div>
                <label className="text-sm">Message</label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 min-h-[96px]"
                  value={cMsg}
                  onChange={(e) => setCMsg(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => setContactOpen(false)}
                  disabled={contactLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-60"
                  disabled={contactLoading}
                >
                  {contactLoading ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------- subcomponents (bottom) -------------------------- */

function PlanRow({
  active,
  icon,
  title,
  subtitle,
  bullets,
  rightBadge,
}: {
  active?: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bullets: string[];
  rightBadge?: React.ReactNode;
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
        <div className="flex items-center gap-2">{rightBadge}</div>
      </div>
      <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5 space-y-1">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      <div>{action}</div>
    </div>
  );
}

function Bucket({
  title,
  remaining,
  limit,
  className = "",
}: {
  title: string;
  remaining: number | null;
  limit: number | null;
  className?: string;
}) {
  const rightText =
    limit === null || remaining === null ? "—" : `${remaining}/${limit}`;
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{rightText}</span>
      </div>
      <RemainingBar limit={limit} remaining={remaining} />
    </div>
  );
}
