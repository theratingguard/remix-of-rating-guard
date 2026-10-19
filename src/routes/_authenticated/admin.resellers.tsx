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

type ResellerProfile = Tables<"reseller_profiles">;
type Commission = Tables<"reseller_commissions">;

export const Route = createFileRoute("/_authenticated/admin/resellers")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminResellersPage,
});

function AdminResellersPage() {
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ["admin", "reseller-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ResellerProfile[];
    },
    refetchInterval: 30_000,
  });
  const commissionsQuery = useQuery({
    queryKey: ["admin", "reseller-commissions"],
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
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const rows = commissionsQuery.data ?? [];
    setAmounts((current) => {
      const next = { ...current };
      for (const row of rows)
        if (!(row.id in next)) next[row.id] = (row.amount_paise / 100).toFixed(2);
      return next;
    });
    setStatuses((current) => {
      const next = { ...current };
      for (const row of rows) if (!(row.id in next)) next[row.id] = row.status;
      return next;
    });
  }, [commissionsQuery.data]);

  async function saveCommission(row: Commission) {
    const rupees = Number(amounts[row.id]);
    if (!Number.isFinite(rupees) || rupees < 0 || rupees > 21_474_836.47) {
      toast.error("Enter a commission amount between ₹0 and ₹21,474,836.47.");
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    setSaving(row.id);
    const { error } = await supabase
      .from("reseller_commissions")
      .update({
        amount_paise: amountPaise,
        status: statuses[row.id] ?? row.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) toast.error("Could not save this commission.");
    else {
      toast.success("Commission updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "reseller-commissions"] });
    }
    setSaving(null);
  }

  const profiles = profilesQuery.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const commissions = commissionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Partner administration</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Resellers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review reseller referrals and set commission amounts and status.
        </p>
      </header>

      {(profilesQuery.error || commissionsQuery.error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          Reseller data could not be loaded. Refresh and check the migration status.
        </p>
      )}
      {(profilesQuery.isPending || commissionsQuery.isPending) && (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      )}

      {!profilesQuery.isPending && !profilesQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Reseller accounts ({profiles.length})</h2>
            {profiles.length === 0 ? (
              <p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
                No reseller profiles yet. Resellers get a profile when they open their workspace.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-3 font-medium">Referral code</th>
                      <th className="px-3 py-3 font-medium">Mobile</th>
                      <th className="px-3 py-3 font-medium">Account ID</th>
                      <th className="px-3 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.user_id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-mono font-semibold">
                          {profile.referral_code}
                        </td>
                        <td className="px-3 py-3">{profile.mobile ?? "Not provided"}</td>
                        <td className="px-3 py-3 font-mono text-xs">
                          …{profile.user_id.slice(-8)}
                        </td>
                        <td className="px-3 py-3">
                          {new Date(profile.created_at).toLocaleDateString()}
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

      {!commissionsQuery.isPending && !commissionsQuery.error && (
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="mb-4 font-semibold">Referral commissions ({commissions.length})</h2>
            {commissions.length === 0 ? (
              <p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
                No verified referral signups have been recorded.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-3 font-medium">Reseller</th>
                      <th className="px-3 py-3 font-medium">Referred account</th>
                      <th className="px-3 py-3 font-medium">Joined</th>
                      <th className="px-3 py-3 font-medium">Amount (₹)</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-mono text-xs">
                          {profileById.get(row.reseller_id)?.referral_code ??
                            `…${row.reseller_id.slice(-8)}`}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs">
                          …{row.referred_user_id.slice(-8)}
                        </td>
                        <td className="px-3 py-3">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3">
                          <Input
                            aria-label={`Commission amount for ${row.id}`}
                            inputMode="decimal"
                            type="number"
                            min="0"
                            max="21474836.47"
                            step="0.01"
                            value={amounts[row.id] ?? (row.amount_paise / 100).toFixed(2)}
                            onChange={(event) =>
                              setAmounts((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                            className="w-32"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <select
                            aria-label={`Commission status for ${row.id}`}
                            value={statuses[row.id] ?? row.status}
                            onChange={(event) =>
                              setStatuses((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                            className="h-10 rounded-md border bg-background px-2 capitalize"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving === row.id}
                            onClick={() => void saveCommission(row)}
                          >
                            {saving === row.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4" />
                            )}
                            <span className="sr-only">Save commission</span>
                          </Button>
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
    </div>
  );
}
