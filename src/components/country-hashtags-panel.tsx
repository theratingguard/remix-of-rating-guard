import { useQuery } from "@tanstack/react-query";
import { Copy, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { SEO_KEYWORD_COUNTRIES } from "@/lib/seo/keyword-options";

export function CountryHashtagsPanel() {
  const [countryCode, setCountryCode] = useState<string>("US");
  const country = SEO_KEYWORD_COUNTRIES.find(
    (item) => item.locale.split("-")[1] === countryCode,
  );
  const hashtags = useQuery({
    queryKey: ["country-hashtags", countryCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_hashtags")
        .select("hashtag")
        .eq("country_code", countryCode)
        .order("hashtag")
        .limit(100);
      if (error) throw new Error(`Could not load country hashtags: ${error.message}`);
      return (data ?? []).map((row) => row.hashtag);
    },
  });
  const values = hashtags.data ?? [];

  async function copyHashtags() {
    if (values.length === 0) {
      toast.error("There are no hashtags to copy for this country.");
      return;
    }
    try {
      await navigator.clipboard.writeText(values.join(" "));
      toast.success(`Copied ${values.length} hashtags for ${country?.country ?? countryCode}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? `Could not copy hashtags: ${error.message}` : "Could not copy hashtags.",
      );
    }
  }

  return (
    <section aria-labelledby="country-hashtags-heading">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="country-hashtags-heading" className="font-semibold">
                Country Hashtags
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                View and copy the generated country-specific SEO hashtags.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                aria-label="Hashtag country"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
              >
                {SEO_KEYWORD_COUNTRIES.map((item) => {
                  const code = item.locale.split("-")[1]!;
                  return (
                    <option key={code} value={code}>
                      {item.country} ({code})
                    </option>
                  );
                })}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!values.length}
                onClick={() => void copyHashtags()}
              >
                <Copy className="mr-2 size-4" />
                Copy {values.length}
              </Button>
            </div>
          </div>

          {hashtags.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" /> Loading hashtags…
            </p>
          ) : hashtags.error ? (
            <p role="alert" className="text-sm text-destructive">
              {hashtags.error.message}
            </p>
          ) : values.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hashtags found. Apply the country hashtags migration to seed the catalog.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" aria-label={`${country?.country} hashtags`}>
              {values.map((hashtag) => (
                <span
                  key={hashtag}
                  className="rounded-full border bg-muted/40 px-3 py-1 text-sm"
                >
                  {hashtag}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
