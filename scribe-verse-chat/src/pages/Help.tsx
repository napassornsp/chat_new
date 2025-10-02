import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Help() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/help" : "";
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!name || !email || !subject || !message) {
      toast({ title: "Missing fields", description: "Please fill out all fields." });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("contact-support", {
        body: { name, email, subject, message },
      });
      if (error) throw error;
      toast({ title: "Request sent", description: "We'll get back to you shortly." });
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message ?? "Please try again later." });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="container py-8 min-h-svh">
      <Helmet>
        <title>Help & Support | Company</title>
        <meta name="description" content="Contact support, read FAQs, and get help using our AI + automation suite." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">Help Center</h1>
        <p className="text-muted-foreground">Contact our team or browse common questions.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea rows={6} placeholder="Write your message..." value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={submit} disabled={sending}>{sending ? "Sending..." : "Send"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">Note: Email delivery requires configuring the RESEND_API_KEY secret.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FAQs</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>What is this application?</AccordionTrigger>
                <AccordionContent>
                  An AI + automation suite tailored for manufacturing: chat assistance, OCR, and vision workflows.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>How do I upgrade my plan?</AccordionTrigger>
                <AccordionContent>
                  Visit the Pricing page to choose a plan. Purchases and higher limits unlock instantly after checkout.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>How can I contact support?</AccordionTrigger>
                <AccordionContent>
                  Use the contact form here or email us. We'll reply within 1-2 business days.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
