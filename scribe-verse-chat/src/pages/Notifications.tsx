import { Helmet } from "react-helmet-async";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Notifications() {
  const canonical = typeof window !== "undefined" ? window.location.origin + "/notifications" : "";
  const items = [
    { id: 1, title: "Welcome!", body: "Thanks for joining our platform.", unread: true },
    { id: 2, title: "New feature", body: "Vision AI got an update.", unread: true },
    { id: 3, title: "Credits", body: "You received bonus credits.", unread: false },
  ];
  const unread = items.filter(i => i.unread).length;

  return (
    <main className="container py-8 min-h-svh">
      <Helmet>
        <title>{`Notifications (${unread}) | Company`}</title>
        <meta name="description" content="View your latest notifications and updates." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          Notifications {unread > 0 && (<Badge className="ml-1">{unread} unread</Badge>)}
        </h1>
      </header>

      <section className="grid gap-4">
        {items.map((n) => (
          <Card key={n.id} className={n.unread ? "border-primary/40" : undefined}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {n.title} {n.unread && <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{n.body}</CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
