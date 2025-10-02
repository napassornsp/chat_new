// src/pages/Auth.tsx
import { useEffect, useState } from "react";
import useAuthSession from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import service from "@/services/backend";

type Mode = "login" | "signup";

export default function Auth() {
  const { user, loading } = useAuthSession();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      // already signed in
      window.location.href = "/";
    }
  }, [loading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        // explicit call for login (Flask)
        const res = await service.login(email.trim(), password);
        if (!res?.user) throw new Error("Login failed");
        toast({ title: "Welcome back!" });
      } else {
        // explicit call for signup (Flask)
        const res = await service.register({
          email: email.trim(),
          password,
          name: name.trim() || email.split("@")[0] || "User",
        });
        if (!res?.user) throw new Error("Sign up failed");
        toast({ title: "Account created!" });
      }
      window.location.href = "/";
    } catch (err: any) {
      toast({
        title: mode === "login" ? "Login failed" : "Sign up failed",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 border rounded-lg p-6 bg-card"
      >
        <h1 className="text-lg font-semibold">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>

        {mode === "signup" && (
          <div className="space-y-1">
            <label className="text-sm">Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm">Email</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            className="w-full border rounded px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>

        <button
          className="w-full rounded bg-primary text-primary-foreground py-2 disabled:opacity-60"
          type="submit"
          disabled={busy}
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
        </button>

        <div className="text-sm text-center">
          {mode === "login" ? (
            <>
              Don’t have an account?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMode("signup")}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
