import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Copy, LoaderCircle, MessageCircle, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ResellerProfile = Tables<"reseller_profiles">;
type Commission = Pick<
  Tables<"reseller_commissions">,
  | "id"
  | "referred_user_id"
  | "review_removal_order_id"
  | "amount_cents"
  | "status"
  | "hold_until"
  | "created_at"
>;
type Membership = Tables<"reseller_memberships">;

export const Route = createFileRoute("/_authenticated/reseller")({
  component: ResellerDashboard,
});

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function ResellerDashboard() {
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const profileQuery = useQuery({
    queryKey: ["reseller-profile"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ensure_reseller_profile");
      if (error) throw error;
      return data[0] ?? null;
    },
  });
  const commissionQuery = useQuery({
    queryKey: ["reseller-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_commissions")
        .select(
          "id,referred_user_id,review_removal_order_id,amount_cents,status,hold_until,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Commission[];
    },
    refetchInterval: 30_000,
  });
  const membershipQuery = useQuery({
    queryKey: ["reseller-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_memberships")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Membership[];
    },
    refetchInterval: 30_000,
  });
  const payoutQuery = useQuery({
    queryKey: ["reseller-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("id,amount_cents,status,requested_at")
        .order("requested_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (profileQuery.data?.mobile) setMobile(profileQuery.data.mobile);
  }, [profileQuery.data]);

  async function saveMobile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = mobile.trim();
    if (!/^\+?[0-9 ()-]{6,32}$/.test(normalized)) {
      toast.error("Enter a valid mobile number.");
      return;
    }
    const profile = profileQuery.data as ResellerProfile | null | undefined;
    if (!profile) return;
    const { error } = await supabase
      .from("reseller_profiles")
      .update({ mobile: normalized, updated_at: new Date().toISOString() })
      .eq("user_id", profile.user_id);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "That mobile number is already in use."
          : "Could not save your number.",
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["reseller-profile"] });
    toast.success("Mobile number saved.");
  }

  async function copyReferral() {
    const code = profileQuery.data?.referral_code;
    if (!code) return;
    try {
      const invite = new URL("/join", window.location.origin);
      invite.searchParams.set("ref", code);
      await navigator.clipboard.writeText(invite.toString());
      toast.success("Client invite link copied.");
    } catch {
      toast.error("Could not copy the referral code. Select and copy it instead.");
    }
  }

  const referrals = commissionQuery.data ?? [];
  const referredAccounts = new Set(
    referrals
      .filter((item) => item.review_removal_order_id === null)
      .map((item) => item.referred_user_id),
  );
  const earnedCents = referrals.reduce(
    (total, item) => total + (item.review_removal_order_id ? item.amount_cents : 0),
    0,
  );
  const availableCents = referrals.reduce(
    (total, item) => total + (item.status === "available" ? item.amount_cents : 0),
    0,
  );
  const activeMembership = (membershipQuery.data ?? []).find(
    (membership) => membership.status === "active",
  );

  async function requestPayout() {
    if (payoutBusy) return;
    setPayoutBusy(true);
    try {
      const { error } = await supabase.rpc("request_reseller_payout");
      if (error) throw error;
      toast.success("Payout request submitted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reseller-commissions"] }),
        queryClient.invalidateQueries({ queryKey: ["reseller-payouts"] }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payout request could not be submitted.",
      );
    } finally {
      setPayoutBusy(false);
    }
  }

  if (profileQuery.isPending) {
    return (
      <div className="grid min-h-[60svh] place-items-center">
        <LoaderCircle className="size-7 animate-spin" />
      </div>
    );
  }
  if (profileQuery.error || !profileQuery.data) {
    return (
      <p
        role="alert"
        className="m-6 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
      >
        Reseller profile could not be loaded. Confirm your account has the reseller role, then
        refresh.
      </p>
    );
  }

  return (
    <main className="mx-auto min-h-svh max-w-6xl space-y-7 bg-background px-4 py-8 text-foreground sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Partner workspace</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            Reseller dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track referrals and commission updates from your Rating Guard account.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/chat">
            <MessageCircle className="mr-2 size-4" /> Chat with Superadmin
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Referred accounts</p>
              <p className="mt-1 text-2xl font-bold">{referredAccounts.size}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Wallet className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Recorded removal commissions</p>
              <p className="mt-1 text-2xl font-bold">{formatUsd(earnedCents)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">Available after 14-day hold</p>
              <p className="mt-1 text-2xl font-bold">{formatUsd(availableCents)}</p>
            </div>
            <Button
              size="sm"
              disabled={!activeMembership || payoutBusy || availableCents <= 0}
              onClick={() => void requestPayout()}
            >
              {payoutBusy ? "Requesting…" : "Request payout"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <h2 className="font-semibold">Membership status</h2>
          {membershipQuery.error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Membership could not be loaded.
            </p>
          ) : membershipQuery.isPending ? (
            <LoaderCircle className="mt-3 size-5 animate-spin" />
          ) : (membershipQuery.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No plan application is recorded yet. Contact the Superadmin to select a plan.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {membershipQuery.data?.map((membership) => (
                <li
                  key={membership.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg border p-3"
                >
                  <span>
                    {membership.plan_id.toUpperCase()} · {formatUsd(membership.annual_fee_cents)} /
                    year · {(membership.commission_bps / 100).toFixed(2)}%
                  </span>
                  <span className="capitalize">{membership.status.replaceAll("_", " ")}</span>
                  {membership.payment_reference && (
                    <span className="w-full text-xs text-muted-foreground">
                      Payment recorded: {membership.payment_reference}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {profileQuery.data.status !== "approved" && (
            <p className="mt-3 text-sm text-amber-700">
              Your reseller account is {profileQuery.data.status}. Membership activation and payouts
              require Superadmin approval and independently confirmed payment.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="hover:translate-y-0">
          <CardContent className="space-y-5 p-5 sm:p-7">
            <div>
              <h2 className="font-semibold">Your referral code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share this invite link with a new client to register with your code attached.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                aria-label="Referral code"
                readOnly
                value={profileQuery.data.referral_code}
                className="font-mono text-base font-bold tracking-wider"
              />
              <Button
                variant="outline"
                onClick={() => void copyReferral()}
                aria-label="Copy client invite link"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A commission is calculated only for an eligible referred client after a removal is
              verified and the client payment is recorded. It remains unavailable for payout during
              the 14-day holding period.
            </p>
          </CardContent>
        </Card>

        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="font-semibold">Unique mobile number</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your number is private and must not already belong to another reseller.
            </p>
            <form onSubmit={(event) => void saveMobile(event)} className="mt-5 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="reseller-mobile">Mobile</Label>
                <Input
                  id="reseller-mobile"
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  placeholder="+91 98765 43210"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={profileQuery.isFetching}>
                Save mobile number
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Referral & commission history</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only your own referral and commission records are visible.
              </p>
            </div>
            {commissionQuery.isFetching && (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {commissionQuery.error && (
            <p role="alert" className="text-sm text-destructive">
              Referral history could not be loaded.
            </p>
          )}
          {!commissionQuery.error && referrals.length === 0 && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No referrals have been recorded yet.
            </p>
          )}
          {referrals.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Recorded</th>
                    <th className="px-3 py-3 font-medium">Account</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Commission</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Available after</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        …{item.referred_user_id.slice(-8)}
                      </td>
                      <td className="px-3 py-3">
                        {item.review_removal_order_id ? "Verified removal" : "Referral"}
                      </td>
                      <td className="px-3 py-3">
                        {item.review_removal_order_id ? formatUsd(item.amount_cents) : "—"}
                      </td>
                      <td className="px-3 py-3 capitalize">{item.status}</td>
                      <td className="px-3 py-3">
                        {item.hold_until ? new Date(item.hold_until).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <h2 className="font-semibold">Payout history</h2>
          {payoutQuery.error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Payout history could not be loaded.
            </p>
          ) : payoutQuery.isPending ? (
            <LoaderCircle className="mt-3 size-5 animate-spin" />
          ) : (payoutQuery.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No payout requests have been submitted.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {payoutQuery.data?.map((payout) => (
                <li key={payout.id} className="flex justify-between gap-3 rounded-lg border p-3">
                  <span>{formatUsd(payout.amount_cents)}</span>
                  <span className="capitalize">{payout.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
