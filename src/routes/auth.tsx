import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Wifi, Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — SmartLinkNet" },
      { name: "description", content: "Sign in to manage your ISP, hotspots, and customers on SmartLinkNet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [mounted, navigate]);

  if (!mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, company_name: companyName },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Welcome to SmartLinkNet");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/dashboard`,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Wifi className="h-4 w-4" />
          </div>
          <span className="text-xl font-semibold">
            SmartLink<span className="text-primary">Net</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your ISP dashboard"
              : "Start your 14-day SmartLinkNet trial"}
          </p>

          <button
            onClick={handleGoogle}
            disabled={oauthLoading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background/50 px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <Field label="Full name">
                  <input
                    required value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Jane Wanjiru"
                  />
                </Field>
                <Field label="Company / ISP name">
                  <input
                    required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="SwiftNet Limited"
                  />
                </Field>
              </>
            )}
            <Field label="Email">
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Email"
              />
            </Field>
            <Field label="Password">
              <input
                type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Password"
              />
            </Field>
            <button
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account yet? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.8-1.8 13.3-4.8l-6.1-5c-2 1.4-4.4 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C40.7 35.4 43.5 30.1 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
    </svg>
  );
}
