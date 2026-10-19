import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"reseller_profiles">;
type Plan = Tables<"reseller_plans">;
type Membership = Tables<"reseller_memberships">;
type Commission = Tables<"reseller_commissions">;
type Order = Tables<"review_removal_orders">;
type Payout = Tables<"payout_requests">;
type PlanDraft = { annualFee: string; commission: string; active: boolean };

function orderReferenceKey(order: Order) {
  return `${order.status === "payment_due" ? "payment" : "google"}-${order.id}`;
}

export const Route = createFileRoute("/_authenticated/admin/resellers")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminResellersPage,
});

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function AdminResellersPage() {
  const queryClient = useQueryClient();
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "reseller"] });
  const profilesQuery = useQuery({
    queryKey: ["admin", "reseller", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Profile[];
    },
    refetchInterval: 30_000,
  });
  const plansQuery = useQuery({
    queryKey: ["admin", "reseller", "plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_plans")
        .select("*")
        .order("annual_fee_cents");
      if (error) throw error;
      return data as Plan[];
    },
  });
  const membershipsQuery = useQuery({
    queryKey: ["admin", "reseller", "memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_memberships")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Membership[];
    },
    refetchInterval: 30_000,
  });
  const commissionsQuery = useQuery({
    queryKey: ["admin", "reseller", "commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_commissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Commission[];
    },
    refetchInterval: 30_000,
  });
  const ordersQuery = useQuery({
    queryKey: ["admin", "reseller", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_removal_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 30_000,
  });
  const payoutsQuery = useQuery({
    queryKey: ["admin", "reseller", "payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Payout[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    for (const plan of plansQuery.data ?? []) {
      setPlanDrafts((current) =>
        plan.id in current
          ? current
          : {
              ...current,
              [plan.id]: {
                annualFee: (plan.annual_fee_cents / 100).toFixed(2),
                commission: (plan.commission_bps / 100).toFixed(2),
                active: plan.is_active,
              },
            },
      );
    }
  }, [plansQuery.data]);

  async function runAction(
    key: string,
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) {
    setSaving(key);
    try {
      const result = await action();
      if (result.error) throw result.error;
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action could not be completed.");
    } finally {
      setSaving(null);
    }
  }

  function referenceFor(id: string) {
    return references[id]?.trim() ?? "";
  }

  const profiles = profilesQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const memberships = membershipsQuery.data ?? [];
  const commissions = commissionsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const payouts = payoutsQuery.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const loading =
    profilesQuery.isPending ||
    plansQuery.isPending ||
    membershipsQuery.isPending ||
    commissionsQuery.isPending ||
    ordersQuery.isPending ||
    payoutsQuery.isPending;
  const loadError = [
    profilesQuery.error,
    plansQuery.error,
    membershipsQuery.error,
    commissionsQuery.error,
    ordersQuery.error,
    payoutsQuery.error,
  ].find(Boolean);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Partner administration</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          Resellers & commerce
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Record only independently verified payments and Google decisions. This dashboard does not
          collect payments or submit/verify review removals automatically.
        </p>
      </header>

      {loadError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          Some reseller records could not be loaded. Check that the commerce migration has been
          applied and refresh.
        </p>
      )}
      {loading && (
        <div className="grid min-h-36 place-items-center">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      )}

      {!plansQuery.isPending && !plansQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Membership plans</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const draft = planDrafts[plan.id] ?? {
                  annualFee: (plan.annual_fee_cents / 100).toFixed(2),
                  commission: (plan.commission_bps / 100).toFixed(2),
                  active: plan.is_active,
                };
                return (
                  <section key={plan.id} className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <label className="block text-sm">
                      Annual fee (USD)
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.annualFee}
                        onChange={(event) =>
                          setPlanDrafts((current) => ({
                            ...current,
                            [plan.id]: { ...draft, annualFee: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Commission (%)
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={draft.commission}
                        onChange={(event) =>
                          setPlanDrafts((current) => ({
                            ...current,
                            [plan.id]: { ...draft, commission: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) =>
                          setPlanDrafts((current) => ({
                            ...current,
                            [plan.id]: { ...draft, active: event.target.checked },
                          }))
                        }
                      />
                      Available for new applications
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Current: {formatUsd(plan.annual_fee_cents)} / year ·{" "}
                      {(plan.commission_bps / 100).toFixed(2)}%
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving === `plan-${plan.id}`}
                      onClick={() => {
                        const annual = Number(draft.annualFee);
                        const commission = Number(draft.commission);
                        if (
                          !Number.isFinite(annual) ||
                          annual < 0 ||
                          annual > 21_474_836.47 ||
                          !Number.isFinite(commission) ||
                          commission < 0 ||
                          commission > 100
                        ) {
                          toast.error("Enter a valid annual fee and commission percentage.");
                          return;
                        }
                        void runAction(
                          `plan-${plan.id}`,
                          () =>
                            supabase.rpc("admin_set_reseller_plan", {
                              _plan_id: plan.id,
                              _annual_fee_cents: Math.round(annual * 100),
                              _commission_bps: Math.round(commission * 100),
                              _is_active: draft.active,
                            }),
                          `${plan.name} plan saved.`,
                        );
                      }}
                    >
                      {saving === `plan-${plan.id}` ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save plan
                    </Button>
                  </section>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!profilesQuery.isPending && !profilesQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Reseller applications ({profiles.length})</h2>
            {profiles.length === 0 ? (
              <p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
                No reseller applications have been received.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="p-3">Referral code</th>
                      <th className="p-3">Account</th>
                      <th className="p-3">Mobile</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.user_id} className="border-b last:border-0">
                        <td className="p-3 font-mono">{profile.referral_code}</td>
                        <td className="p-3 font-mono text-xs">…{profile.user_id.slice(-8)}</td>
                        <td className="p-3">{profile.mobile ?? "Not provided"}</td>
                        <td className="p-3 capitalize">{profile.status}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {(["approved", "rejected", "suspended"] as const).map((decision) => (
                              <Button
                                key={decision}
                                size="sm"
                                variant="outline"
                                disabled={saving === `profile-${profile.user_id}`}
                                onClick={() =>
                                  void runAction(
                                    `profile-${profile.user_id}`,
                                    () =>
                                      supabase.rpc("admin_review_reseller", {
                                        _reseller_id: profile.user_id,
                                        _decision: decision,
                                      }),
                                    `Reseller ${decision}.`,
                                  )
                                }
                              >
                                {decision}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!membershipsQuery.isPending && !membershipsQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Memberships ({memberships.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-3">Reseller</th>
                    <th className="p-3">Plan / fee</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payment reference</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => (
                    <tr key={membership.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">
                        {profileById.get(membership.reseller_id)?.referral_code ??
                          `…${membership.reseller_id.slice(-8)}`}
                      </td>
                      <td className="p-3">
                        {planById.get(membership.plan_id)?.name ?? membership.plan_id} ·{" "}
                        {formatUsd(membership.annual_fee_cents)} ·{" "}
                        {(membership.commission_bps / 100).toFixed(2)}%
                      </td>
                      <td className="p-3 capitalize">{membership.status.replaceAll("_", " ")}</td>
                      <td className="p-3">
                        {membership.status === "pending_payment" ? (
                          <Input
                            aria-label={`Membership payment reference ${membership.id}`}
                            minLength={8}
                            value={references[`membership-${membership.id}`] ?? ""}
                            onChange={(event) =>
                              setReferences((current) => ({
                                ...current,
                                [`membership-${membership.id}`]: event.target.value,
                              }))
                            }
                            placeholder="Verified transaction reference"
                          />
                        ) : (
                          (membership.payment_reference ?? "—")
                        )}
                      </td>
                      <td className="p-3">
                        {membership.status === "pending_payment" && (
                          <Button
                            size="sm"
                            disabled={
                              saving === `membership-${membership.id}` ||
                              referenceFor(`membership-${membership.id}`).length < 8
                            }
                            onClick={() =>
                              void runAction(
                                `membership-${membership.id}`,
                                () =>
                                  supabase.rpc("admin_activate_reseller_membership", {
                                    _membership_id: membership.id,
                                    _payment_reference: referenceFor(`membership-${membership.id}`),
                                  }),
                                "Membership payment recorded and membership activated.",
                              )
                            }
                          >
                            Activate after payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!ordersQuery.isPending && !ordersQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-2 font-semibold">Review-removal orders ({orders.length})</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              $49 per review, payable only after the actual removal has been verified. Add
              references only after checking the original Google record or payment proof.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-3">Created</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Review</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Reference / action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const referenceKey = orderReferenceKey(order);
                    return (
                      <tr key={order.id} className="border-b last:border-0 align-top">
                        <td className="p-3 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 font-mono text-xs">…{order.client_id.slice(-8)}</td>
                        <td className="p-3 font-mono text-xs">…{order.review_id.slice(-8)}</td>
                        <td className="p-3">{formatUsd(order.price_cents)}</td>
                        <td className="p-3 capitalize">{order.status.replaceAll("_", " ")}</td>
                        <td className="p-3">
                          {order.status !== "paid" && order.status !== "not_removed" && (
                            <>
                              <Input
                                aria-label={`Reference for order ${order.id}`}
                                value={references[referenceKey] ?? ""}
                                onChange={(event) =>
                                  setReferences((current) => ({
                                    ...current,
                                    [referenceKey]: event.target.value,
                                  }))
                                }
                                placeholder={
                                  order.status === "payment_due"
                                    ? "Confirmed payment reference"
                                    : "Google reference, if required"
                                }
                                className="mb-2"
                              />
                              {order.status === "requested" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void runAction(
                                      `order-${order.id}`,
                                      () =>
                                        supabase.rpc("admin_update_review_removal_order", {
                                          _order_id: order.id,
                                          _status: "evidence_prepared",
                                        }),
                                      "Evidence preparation recorded.",
                                    )
                                  }
                                >
                                  Evidence prepared
                                </Button>
                              )}
                              {order.status === "evidence_prepared" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={referenceFor(referenceKey).length < 8}
                                  onClick={() =>
                                    void runAction(
                                      `order-${order.id}`,
                                      () =>
                                        supabase.rpc("admin_update_review_removal_order", {
                                          _order_id: order.id,
                                          _status: "submitted_to_google",
                                          _google_reference: referenceFor(referenceKey),
                                        }),
                                      "Google submission reference recorded.",
                                    )
                                  }
                                >
                                  Record actual submission
                                </Button>
                              )}
                              {order.status === "submitted_to_google" && (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    disabled={referenceFor(referenceKey).length < 8}
                                    onClick={() =>
                                      void runAction(
                                        `order-${order.id}`,
                                        () =>
                                          supabase.rpc("admin_update_review_removal_order", {
                                            _order_id: order.id,
                                            _status: "removed_verified",
                                            _google_reference: referenceFor(referenceKey),
                                          }),
                                        "Google removal recorded; payment is now due.",
                                      )
                                    }
                                  >
                                    Verified removed
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={referenceFor(referenceKey).length < 8}
                                    onClick={() =>
                                      void runAction(
                                        `order-${order.id}`,
                                        () =>
                                          supabase.rpc("admin_update_review_removal_order", {
                                            _order_id: order.id,
                                            _status: "not_removed",
                                            _google_reference: referenceFor(referenceKey),
                                          }),
                                        "Google decision recorded as not removed.",
                                      )
                                    }
                                  >
                                    Not removed
                                  </Button>
                                </div>
                              )}
                              {order.status === "payment_due" && (
                                <Button
                                  size="sm"
                                  disabled={referenceFor(referenceKey).length < 8}
                                  onClick={() =>
                                    void runAction(
                                      `payment-${order.id}`,
                                      () =>
                                        supabase.rpc("admin_confirm_review_payment", {
                                          _order_id: order.id,
                                          _payment_reference: referenceFor(referenceKey),
                                        }),
                                      "Confirmed client payment recorded.",
                                    )
                                  }
                                >
                                  Confirm received payment
                                </Button>
                              )}
                            </>
                          )}
                          {(order.google_reference || order.payment_reference) && (
                            <p className="mt-2 break-all text-xs text-muted-foreground">
                              {order.google_reference && <>Google: {order.google_reference}</>}
                              {order.payment_reference && (
                                <> · Payment: {order.payment_reference}</>
                              )}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!commissionsQuery.isPending && !commissionsQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Commission ledger ({commissions.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-3">Reseller</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Order</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Rate / hold</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((commission) => (
                    <tr key={commission.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">
                        {profileById.get(commission.reseller_id)?.referral_code ??
                          `…${commission.reseller_id.slice(-8)}`}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        …{commission.referred_user_id.slice(-8)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {commission.review_removal_order_id
                          ? `…${commission.review_removal_order_id.slice(-8)}`
                          : "Referral"}
                      </td>
                      <td className="p-3">
                        {commission.review_removal_order_id
                          ? formatUsd(commission.amount_cents)
                          : "—"}
                      </td>
                      <td className="p-3">
                        {commission.commission_bps
                          ? `${(commission.commission_bps / 100).toFixed(2)}% · ${commission.hold_until ? new Date(commission.hold_until).toLocaleDateString() : "—"}`
                          : "—"}
                      </td>
                      <td className="p-3 capitalize">{commission.status.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!payoutsQuery.isPending && !payoutsQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Payout requests ({payouts.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-3">Reseller</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payment reference</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">
                        {profileById.get(payout.reseller_id)?.referral_code ??
                          `…${payout.reseller_id.slice(-8)}`}
                      </td>
                      <td className="p-3">{formatUsd(payout.amount_cents)}</td>
                      <td className="p-3 capitalize">{payout.status}</td>
                      <td className="p-3">
                        {payout.status === "approved" ? (
                          <Input
                            aria-label={`Payout payment reference ${payout.id}`}
                            value={references[`payout-${payout.id}`] ?? ""}
                            onChange={(event) =>
                              setReferences((current) => ({
                                ...current,
                                [`payout-${payout.id}`]: event.target.value,
                              }))
                            }
                            placeholder="Verified payout reference"
                          />
                        ) : (
                          (payout.payment_reference ?? "—")
                        )}
                      </td>
                      <td className="p-3">
                        {payout.status === "requested" && (
                          <div className="flex gap-2">
                            {(["approved", "rejected"] as const).map((decision) => (
                              <Button
                                key={decision}
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void runAction(
                                    `payout-${payout.id}`,
                                    () =>
                                      supabase.rpc("admin_review_payout", {
                                        _payout_id: payout.id,
                                        _decision: decision,
                                      }),
                                    `Payout ${decision}.`,
                                  )
                                }
                              >
                                {decision}
                              </Button>
                            ))}
                          </div>
                        )}
                        {payout.status === "approved" && (
                          <Button
                            size="sm"
                            disabled={referenceFor(`payout-${payout.id}`).length < 8}
                            onClick={() =>
                              void runAction(
                                `payout-${payout.id}`,
                                () =>
                                  supabase.rpc("admin_review_payout", {
                                    _payout_id: payout.id,
                                    _decision: "paid",
                                    _payment_reference: referenceFor(`payout-${payout.id}`),
                                  }),
                                "Payout recorded as paid.",
                              )
                            }
                          >
                            Confirm payout
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
