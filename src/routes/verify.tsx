import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/verify")({ component: VerifyPage });

function VerifyPage() {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionPhone, setSessionPhone] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    if (resendTimer > 0) {
      timer = window.setTimeout(() => setResendTimer((current) => Math.max(0, current - 1)), 1000);
    }
    return () => window.clearTimeout(timer);
  }, [resendTimer]);

  useEffect(() => {
    async function init() {
      const session = await supabase.auth.getSession();
      const user = session.data.session?.user;
      if (!user) return;
      setSessionUserId(user.id);
      setSessionEmail(user.email ?? null);
      setSessionPhone(((user.user_metadata ?? {}) as any).phone ?? null);

      if (user.id) {
        await sendVerificationCode(user.id, user.email ?? null, ((user.user_metadata ?? {}) as any).phone ?? null);
      }
    }

    init();
  }, []);

  async function sendVerificationCode(userId: string, email: string | null, phone: string | null) {
    if (!phone) {
      setErrorMessage("Phone number is unavailable. Please sign in again and make sure your contact phone is provided.");
      return;
    }

    setSending(true);
    setErrorMessage(null);
    try {
      await supabase.functions.invoke("signup-send-otp", {
        body: { userId, email, phone },
      });
      setSentMessage(`A verification code has been sent to ${phone}.`);
      setResendTimer(30);
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Unable to send verification code.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;
      if (!userId) throw new Error("Not signed in");

      const res = await fetch(`/api/verify-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: otp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verification failed");
      toast.success("Phone verified");
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_bottom,rgba(52,211,153,0.16),transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.95))]" />
      <div className="relative mx-auto flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl rounded-4xl border border-white/10 bg-slate-950/95 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/80">SmartlinkNet</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Verify your phone</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Use the code sent to the mobile number you registered with. This secures your account and activates your onboarding flow.
              </p>
            </div>
            <Link
              to="/"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              Cancel
            </Link>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-950/70 p-4 text-sm text-slate-300">
                {sentMessage ? (
                  <p>{sentMessage}</p>
                ) : (
                  <p>We are sending a verification code to your phone now.</p>
                )}
                {sessionPhone && <p className="mt-2 text-slate-500">Sending to {sessionPhone}</p>}
                {errorMessage && <p className="mt-2 text-sm text-rose-400">{errorMessage}</p>}
              </div>

              <form onSubmit={handleVerify} className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">6-digit verification code</label>
                  <InputOTP value={otp} onChange={(v:any) => setOtp(v)} length={6} className="mt-3" />
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading}
                >
                  {loading ? 'Verifying…' : 'Verify and continue'}
                </button>
              </form>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-400">
                <button
                  type="button"
                  onClick={() => sessionUserId && sendVerificationCode(sessionUserId, sessionEmail, sessionPhone)}
                  disabled={sending || resendTimer > 0}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? 'Sending…' : resendTimer > 0 ? `Resend available in ${resendTimer}s` : 'Resend code'}
                </button>
                <p className="text-xs text-slate-500">If you did not receive the SMS, check that your phone number is correct and try again.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
