import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const plans = [
  { name: "Free", price: "$0", features: ["Basic chat", "Credits: V1 5/mo, V2 10/mo, V3 15/mo"], cta: "Get Started" },
  { name: "Pro", price: "$15/mo", features: ["All modules", "Priority support", "Credits: V1 10/mo, V2 20/mo, V3 30/mo"], cta: "Purchase" },
  { name: "Premium", price: "$30/mo", features: ["SLA", "Dedicated support", "Credits: V1 20/mo, V2 30/mo, V3 40/mo"], cta: "Purchase" },
  { name: "Business", price: "Contact", features: ["Custom limits", "Enterprise SLA", "Dedicated success manager"], cta: "Contact Sales" },
];

export default function Pricing() {
  const navigate = useNavigate();
  const canonical = typeof window !== "undefined" ? window.location.origin + "/pricing" : "";
  const { toast } = useToast();

  const [contactOpen, setContactOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSelect = (name: string) => {
    if (name === "Business") {
      setContactOpen(true);
      return;
    }
    window.alert(`${name} plan selected. Checkout coming soon.`);
  };
  return (
    <main className="container py-8 min-h-svh">
      <Helmet>
        <title>Pricing | Company</title>
        <meta name="description" content="Free, Pro, Premium, and Business plans. Credits reset on the first day of each calendar month." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <nav className="mb-2 flex justify-end">
        <Button variant="ghost" size="icon" aria-label="Close pricing" onClick={() => navigate(-1)}>
          <X />
        </Button>
      </nav>

      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-muted-foreground">Upgrade anytime. Simple and transparent pricing.</p>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className={p.name === "Pro" ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {p.name}
                {p.name === "Pro" && <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Popular</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-3">{p.price}</div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <Button className="mt-4 w-full" onClick={() => onSelect(p.name)}>
                {p.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="mt-4 text-center text-sm text-muted-foreground">Credits reset on the first day of each calendar month.</p>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Sales</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                const subject = `Sales inquiry from ${name || "Anonymous"}`;
                const details = `Company: ${company || "-"}\nPhone: ${phone || "-"}\n\n${message || ""}`;
                const { error } = await supabase.functions.invoke("contact-support", {
                  body: { name, email, subject, message: details },
                });
                if (error) throw error;
                toast({ title: "Message sent", description: "Our sales team will contact you soon." });
                setContactOpen(false);
                setName(""); setEmail(""); setCompany(""); setPhone(""); setMessage("");
              } catch (err: any) {
                toast({ title: "Failed to send", description: err.message });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
              <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Textarea placeholder="Tell us about your needs" value={message} onChange={(e) => setMessage(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
