import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ResolutionProof = {
  resolution: string;
};
type ClientOutcomes = {
  totalRemoved: number;
  totalPending: number;
  proofs: ResolutionProof[];
};

function parseOutcomes(value: unknown): ClientOutcomes {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The client outcomes response was invalid.");
  const data = value as Record<string, unknown>;
  if (
    typeof data["totalRemoved"] !== "number" ||
    typeof data["totalPending"] !== "number" ||
    !Array.isArray(data["proofs"])
  )
    throw new Error("The client outcomes response was incomplete.");
  const proofs = data["proofs"].map((proof): ResolutionProof => {
    if (!proof || typeof proof !== "object" || Array.isArray(proof))
      throw new Error("A resolution record was invalid.");
    const item = proof as Record<string, unknown>;
    if (typeof item["resolution"] !== "string")
      throw new Error("A resolution record was incomplete.");
    return {
      resolution: item["resolution"],
    };
  });
  return {
    totalRemoved: data["totalRemoved"],
    totalPending: data["totalPending"],
    proofs,
  };
}

export function ClientOutcomesPage() {
  const [proofOpen, setProofOpen] = useState(false);
  const outcomes = useQuery({
    queryKey: ["client-review-outcomes"],
    queryFn: async () => {
      const [{ data: auth, error: authError }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("client_review_outcomes"),
      ]);
      if (authError) throw new Error(`Could not verify client access: ${authError.message}`);
      if (!auth.user || auth.user.app_metadata["role"] !== "client")
        throw new Error("This progress page is available to client accounts only.");
      if (error) throw new Error(`Could not load review outcomes: ${error.message}`);
      return parseOutcomes(data);
    },
  });
  if (outcomes.isLoading) return <p>Loading client outcomes…</p>;
  if (outcomes.error || !outcomes.data)
    return <p role="alert">{outcomes.error?.message ?? "Could not load client outcomes."}</p>;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Review Outcomes"
        subtitle="Progress for your reviews. Staff identity and contact details are not shown."
      />
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Review progress">
        <article className="surface p-5">
          <h2 className="text-sm text-muted-foreground">Reviews removed</h2>
          <p className="mt-2 text-3xl font-semibold">{outcomes.data.totalRemoved}</p>
        </article>
        <article className="surface p-5">
          <h2 className="text-sm text-muted-foreground">Reviews pending</h2>
          <p className="mt-2 text-3xl font-semibold">{outcomes.data.totalPending}</p>
        </article>
      </section>
      <section className="surface space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Final resolution proof</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!outcomes.data.proofs.length}
            onClick={() => setProofOpen((open) => !open)}
          >
            {proofOpen ? "Hide Proof" : "View Proof"}
          </Button>
        </div>
        {proofOpen &&
          outcomes.data.proofs.map((proof, index) => (
            <article className="rounded-lg border p-3" key={`proof-${index}`}>
              <p className="font-medium">{proof.resolution}</p>
            </article>
          ))}
        {!outcomes.data.proofs.length && (
          <p className="text-sm text-muted-foreground">
            No final removals have been confirmed yet.
          </p>
        )}
      </section>
    </div>
  );
}
