import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/home" : "";
  return (
    <main className="min-h-svh">
      <Helmet>
        <title>Home | AI Suite by Company</title>
        <meta name="description" content="Discover our AI Suite: Chatbot, OCR, and Vision AI. Learn about our tech company and see our location." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="container py-8">
        <h1 className="text-3xl font-bold text-foreground">AI + Automation for Manufacturing</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Streamline factory operations with our AI Suite: Chatbot copilots, OCR for documents, and Vision AI for visual inspection.
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => (window.location.href = "/")}>Open Chat</Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/pricing")}>View Pricing</Button>
        </div>
      </header>

      <section className="container grid gap-6 md:grid-cols-3 pb-10">
        <Card>
          <CardHeader>
            <CardTitle>Chatbot Copilot</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Assist technicians and operators with procedures, Q&A, and automation triggers.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>OCR</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Extract data from work orders, invoices, and QC forms with high accuracy.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vision AI</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Detect defects and track production using camera feeds and smart models.
          </CardContent>
        </Card>
      </section>

      <section className="container pb-16">
        <h2 className="text-xl font-semibold mb-4">About the Company</h2>
        <p className="text-muted-foreground max-w-3xl">
          We are a technology company focused on building helpful AI tools for everyone. Our mission is to make advanced
          AI accessible, reliable, and delightful.
        </p>
      </section>

      <section className="container pb-16">
        <h2 className="text-xl font-semibold mb-4">Our Location</h2>
        <div className="aspect-[16/9] rounded-md overflow-hidden border">
          <iframe
            title="Company Location Map"
            className="w-full h-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=Tech%20Company&output=embed`}
          />
        </div>
      </section>
    </main>
  );
}
