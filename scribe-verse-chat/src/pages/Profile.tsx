import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import useAuthSession from "@/hooks/useAuthSession";

export default function Profile() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/profile" : "";
  const { toast } = useToast();
  const { user, loading } = useAuthSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emoji, setEmoji] = useState("😀");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [location, setLocation] = useState("");
  const [joined, setJoined] = useState<string>("");
  const [planName, setPlanName] = useState<string>("Free");
  const [credits, setCredits] = useState<{ v1: number; v2: number; v3: number }>({ v1: 0, v2: 0, v3: 0 });
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,email,avatar_url,company,phone,phone_verified,location,created_at,plan_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.error(error);
        toast({ title: "Failed to load profile", description: error.message });
        return;
      }
      if (data) {
        const d: any = data;
        setName(d.display_name ?? "");
        setEmail(d.email ?? user.email ?? "");
        setEmoji(d.avatar_url ?? "😀");
        setCompany(d.company ?? "");
        setPhone(d.phone ?? "");
        setPhoneVerified(Boolean(d.phone_verified));
        setLocation(d.location ?? "");
        setJoined(d.created_at ? new Date(d.created_at).toLocaleDateString() : "");
        if (d.plan_id) {
          const { data: planRow } = await supabase
            .from("plans")
            .select("name")
            .eq("id", d.plan_id)
            .maybeSingle();
          setPlanName((planRow as any)?.name ?? "Free");
        } else {
          setPlanName("Free");
        }
        const { data: rpcData } = await supabase.rpc("reset_monthly_credits");
        const row: any = Array.isArray(rpcData) ? rpcData?.[0] : rpcData;
        setCredits({ v1: row?.v1 ?? 0, v2: row?.v2 ?? 0, v3: row?.v3 ?? 0 });
      } else {
        setEmail(user.email ?? "");
      }
    };
    load();
  }, [user, toast]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: name, email, avatar_url: emoji, company, phone, location }, { onConflict: "id" });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message });
    } else {
      toast({ title: "Profile updated" });
    }
  };

  return (
    <main className="container py-8 min-h-svh">
      <Helmet>
        <title>User Profile | Company</title>
        <meta name="description" content="Manage your profile and plan. Upgrade anytime." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">Your Profile</h1>
      </header>

      {!loading && !user ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Please sign in to view and edit your profile.</p>
            <Button onClick={() => (window.location.href = "/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 text-xl">
                  <AvatarFallback>{emoji}</AvatarFallback>
                </Avatar>
                <Input placeholder="Profile emoji (e.g. 😀)" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
              </div>
              <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex items-center gap-2">
                <Input type="email" placeholder="Email" value={email} readOnly />
                <Badge variant="secondary">{user?.email_confirmed_at ? "Verified" : "Unverified"}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">Member since: {joined || "-"}</div>
              <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
              <div className="flex items-center gap-2">
                <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Badge variant="secondary">{phoneVerified ? "Verified" : "Unverified"}</Badge>
              </div>
              <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              <Button
                onClick={async () => {
                  if (!user) return;
                  if (!newPassword || newPassword !== confirmPassword) {
                    toast({ title: "Passwords do not match" });
                    return;
                  }
                  setChangingPwd(true);
                  const { error } = await supabase.auth.updateUser({ password: newPassword });
                  setChangingPwd(false);
                  if (error) toast({ title: "Change failed", description: error.message });
                  else {
                    toast({ title: "Password updated" });
                    setNewPassword(""); setConfirmPassword("");
                  }
                }}
                disabled={changingPwd}
              >
                {changingPwd ? "Updating..." : "Change Password"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan & Credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span>Current plan:</span>
                <Badge variant="secondary">{planName}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">Credits reset on the first day of each calendar month.</div>
              <ul className="text-sm text-muted-foreground">
                <li>V1: {credits.v1}</li>
                <li>V2: {credits.v2}</li>
                <li>V3: {credits.v3}</li>
              </ul>
              <Button onClick={() => (window.location.href = "/pricing")}>Change Plan</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
