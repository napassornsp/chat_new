import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, Phone, MapPin, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ——— Configure your business info here ———
const BUSINESS = {
  name: "Your Business Name",
  email: "support@yourbusiness.com",
  phone: "+1 (555) 123-4567",
  addressLine1: "123 Market Street",
  addressLine2: "Suite 456",
  city: "San Francisco",
  state: "CA",
  zip: "94105",
  hours: "Mon–Fri, 9:00am–6:00pm PT",
};

export default function Contact() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/contact" : "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const submit = async () => {
    if (!name || !email || !subject || !message) {
      setStatus("error");
      setStatusMsg("Please fill out all fields.");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("contact-support", {
        body: { name, email, subject, message },
      });
      if (error) throw error;
      setStatus("success");
      setStatusMsg("Thanks for reaching out — we'll get back to you shortly.");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (e) {
      setStatus("error");
      setStatusMsg("Failed to send. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="container py-8 min-h-svh">
      <Helmet>
        <title>Contact {BUSINESS.name} | Company</title>
        <meta name="description" content={`Get in touch with ${BUSINESS.name}. Find our email, phone, address, and quick answers in the FAQ.`} />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="mb-6 rounded-2xl border bg-gradient-to-r from-indigo-50 to-teal-50 p-5">
        <h1 className="text-2xl font-bold">Contact {BUSINESS.name}</h1>
        <p className="text-muted-foreground">We're here to help. Call, email, or send us a message — and browse FAQs on the right.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Business contact + form */}
        <div className="space-y-6">
          <Card className="border-indigo-200/60">
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${BUSINESS.email}`} className="font-medium hover:underline">{BUSINESS.email}</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a href={`tel:${BUSINESS.phone}`} className="font-medium hover:underline">{BUSINESS.phone}</a>
                </div>
              </div>
              <div className="flex items-start gap-3 md:col-span-2">
                <MapPin className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{BUSINESS.addressLine1}{BUSINESS.addressLine2 ? `, ${BUSINESS.addressLine2}` : ""}</p>
                  <p>{BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:col-span-2">
                <Clock className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm text-muted-foreground">Hours</p>
                  <p className="font-medium">{BUSINESS.hours}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: FAQs */}
        <Card className="border-teal-200/60">
          <CardHeader>
            <CardTitle>FAQs</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>What services do you offer?</AccordionTrigger>
                <AccordionContent>
                  We provide AI-assisted automation, computer vision, and workflow tooling tailored to your operations. Custom packages are available.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>How soon will you respond?</AccordionTrigger>
                <AccordionContent>
                  We typically reply within 1–2 business days. For urgent matters, please call our support line during business hours.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Can I upgrade or change my plan later?</AccordionTrigger>
                <AccordionContent>
                  Yes. You can switch plans at any time. Changes take effect immediately after checkout.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger>Where are you located?</AccordionTrigger>
                <AccordionContent>
                  {BUSINESS.addressLine1}{BUSINESS.addressLine2 ? `, ${BUSINESS.addressLine2}` : ""}, {BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5">
                <AccordionTrigger>How do I contact support directly?</AccordionTrigger>
                <AccordionContent>
                  Email <a className="underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> or call <a className="underline" href={`tel:${BUSINESS.phone}`}>{BUSINESS.phone}</a>.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
