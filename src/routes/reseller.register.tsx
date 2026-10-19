import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Plan = Tables<"reseller_plans">;

export const Route = createFileRoute("/reseller/register")({
  component: ResellerRegistrationPage,
});

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function ResellerRegistrationPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState("starter");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plansQuery = useQuery({
    queryKey: ["reseller-plans", "active"],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("reseller_plans")
        .select("*")
        .eq("is_active", true)
        .order("annual_fee_cents");
      if (queryError) throw queryError;
      return data as Plan[];
    },
    staleTime: 60_000,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plansQuery.data?.some((plan) => plan.id === planId)) {
      setError("Choose an available reseller plan.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { account_type: "reseller", reseller_plan: planId },
        },
      });
      if (signupError) throw signupError;
      if (data.session) {
        await navigate({ to: "/reseller", replace: true });
      } else {
        setNotice(
          "Application received. Confirm your email; your reseller profile will remain pending until Rating Guard approves it and records the membership payment.",
        );
      }
    } catch {
      setError("We could not submit your application. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-3xl rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
        <header className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Rating Guard
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">Apply as a reseller</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a plan and create an account. Membership is not active until a Superadmin
            approves the application and records confirmed payment.
          </p>
        </header>

        {plansQuery.isPending ? (
          <div className="grid min-h-36 place-items-center">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : plansQuery.error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            Reseller plans could not be loaded. Please try again later.
          </p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            <fieldset className="grid gap-3 md:grid-cols-3">
              <legend className="sr-only">Choose a reseller plan</legend>
              {plansQuery.data?.map((plan) => (
                <label
                  key={plan.id}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    planId === plan.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="reseller-plan"
                    value={plan.id}
                    checked={planId === plan.id}
                    onChange={() => setPlanId(plan.id)}
                  />
                  <span className="font-semibold">{plan.name}</span>
                  <span className="mt-2 block text-2xl font-bold">
                    {formatUsd(plan.annual_fee_cents)}
                    <span className="text-sm font-normal text-muted-foreground"> / year</span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {plan.commission_bps / 100}% commission on eligible, paid review-removal orders
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reseller-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reseller-email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-password">Password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reseller-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              Membership payment is not collected in this app: there is no payment-gateway
              integration. Do not treat this application as paid or active until payment is
              independently confirmed and recorded by an administrator.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-muted p-3 text-sm">
                {notice}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={busy || !plansQuery.data?.length}
            >
              {busy ? (
                "Submitting application…"
              ) : (
                <>
                  Apply as reseller <ArrowRight />
                </>
              )}
            </Button>
          </form>
        )}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-primary hover:underline" to="/auth">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
