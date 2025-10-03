// src/pages/Auth.tsx
import { useEffect, useState } from "react";
import useAuthSession from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import service from "@/services/backend";
import { Eye, EyeOff } from "lucide-react";

type Mode = "login" | "signup";

export default function Auth() {
  const { user, loading } = useAuthSession();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      window.location.href = "/";
    }
  }, [loading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await service.login(email.trim(), password);
        if (!res?.user) throw new Error("Login failed");
        toast({ title: "Welcome back!" });
      } else {
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
    <>
      {/* Techy Background */}
      <div className="fixed inset-0 z-0 tech-bg" />

      {/* Auth Card */}
      <div className="fixed inset-0 z-10 flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm space-y-5 rounded-xl border bg-white/95 backdrop-blur-sm p-6 shadow-lg"
        >
          <header className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-xs text-gray-500">
              {mode === "login"
                ? "Enter your email and password to continue."
                : "Fill in your details to create an account."}
            </p>
          </header>

          {mode === "signup" && (
            <div className="space-y-1">
              <label className="text-sm">Name</label>
              <input
                className="w-full rounded border px-3 py-2"
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
              className="w-full rounded border px-3 py-2"
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
            <div className="relative">
              <input
                className="w-full rounded border px-3 py-2 pr-10"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid place-items-center px-3 text-gray-400 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            className="w-full rounded bg-[#1f70e5] py-2 text-white font-medium shadow hover:brightness-110 disabled:opacity-60"
            type="submit"
            disabled={busy}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
          </button>

          <div className="text-center text-sm">
            {mode === "login" ? (
              <>
                Don’t have an account?{" "}
                <button
                  type="button"
                  className="text-[#1f70e5] underline"
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
                  className="text-[#1f70e5] underline"
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
