import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import Papa from "papaparse";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  deleteSeoKeywordProviderKey,
  generateSeoLongTailKeywords,
  getSeoKeywordPage,
  getSeoKeywordProviders,
  importSeoKeywords,
  saveSeoKeywordProviderKey,
} from "@/lib/seo-keywords.functions";
import { SEO_KEYWORD_COUNTRIES, SEO_KEYWORD_PROVIDERS } from "@/lib/seo/keyword-options";

const CSV_LIMIT_BYTES = 10 * 1024 * 1024;
const UPLOAD_BATCH_SIZE = 500;
const providerLabels = {
  semrush: "Semrush",
  ahrefs: "Ahrefs",
  dataforseo: "DataForSEO",
} as const;

type KeywordCsvRow = {
  keyword: string;
  country?: string;
  search_volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intent?: "informational" | "navigational" | "commercial" | "transactional";
};

function isKeywordIntent(
  value: string,
): value is NonNullable<KeywordCsvRow["intent"]> {
  return ["informational", "navigational", "commercial", "transactional"].includes(value);
}

function parseNumeric(value: unknown, column: string, rowNumber: number) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`CSV row ${rowNumber}: ${column} must be a non-negative number.`);
  return parsed;
}

async function readKeywordCsv(file: File): Promise<KeywordCsvRow[]> {
  if (file.size > CSV_LIMIT_BYTES) throw new Error("CSV exceeds the 10 MB limit.");
  if (!/\.csv$/i.test(file.name)) throw new Error("Upload a .csv file.");
  const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => {
      const normalized = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
      return ["volume", "monthly_searches"].includes(normalized) ? "search_volume" : normalized;
    },
  });
  if (parsed.errors.length) throw new Error(`CSV parse failed: ${parsed.errors[0]!.message}`);
  const headers = new Set(parsed.meta.fields ?? []);
  if (!headers.has("keyword")) throw new Error("CSV must include a keyword column.");
  if (parsed.data.length > 10_000) throw new Error("Upload no more than 10,000 rows at a time.");
  return parsed.data.map((row, index) => {
    const keyword = String(row["keyword"] ?? "").trim();
    const country = String(row["country"] ?? "United States").trim();
    const intent = String(row["intent"] ?? "informational").trim().toLowerCase();
    if (keyword.length < 3 || keyword.length > 240)
      throw new Error(`CSV row ${index + 2}: keyword must be 3 to 240 characters.`);
    if (!country || country.length > 100)
      throw new Error(
        `CSV row ${index + 2}: country is required and must be at most 100 characters.`,
      );
    if (!isKeywordIntent(intent))
      throw new Error(`CSV row ${index + 2}: unsupported search intent.`);
    const difficulty = parseNumeric(row["difficulty"], "difficulty", index + 2);
    if (difficulty !== null && difficulty > 100)
      throw new Error(`CSV row ${index + 2}: difficulty must be between 0 and 100.`);
    const searchVolume = parseNumeric(row["search_volume"], "search_volume", index + 2);
    if (searchVolume !== null && !Number.isInteger(searchVolume))
      throw new Error(`CSV row ${index + 2}: search_volume must be an integer.`);
    return {
      keyword,
      country,
      search_volume: searchVolume,
      difficulty,
      cpc: parseNumeric(row["cpc"], "cpc", index + 2),
      intent,
    };
  });
}

export function SeoKeywordsPanel() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const loadPage = useServerFn(getSeoKeywordPage);
  const loadProviders = useServerFn(getSeoKeywordProviders);
  const importRows = useServerFn(importSeoKeywords);
  const generateLongTail = useServerFn(generateSeoLongTailKeywords);
  const saveKey = useServerFn(saveSeoKeywordProviderKey);
  const deleteKey = useServerFn(deleteSeoKeywordProviderKey);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const [seedKeyword, setSeedKeyword] = useState("review removal");
  const [generationCountry, setGenerationCountry] = useState("United States");
  const [provider, setProvider] = useState<(typeof SEO_KEYWORD_PROVIDERS)[number]>("semrush");
  const [apiKey, setApiKey] = useState("");
  const [uploading, setUploading] = useState(false);

  const keywords = useQuery({
    queryKey: ["seo-keywords", search, country, page],
    queryFn: () => loadPage({ data: { query: search, country, page } }),
  });
  const providers = useQuery({
    queryKey: ["seo-keyword-providers"],
    queryFn: () => loadProviders(),
  });
  const invalidateKeywordData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["seo-keywords"] }),
      queryClient.invalidateQueries({ queryKey: ["seo-keyword-providers"] }),
    ]);
  };
  const savingKey = useMutation({
    mutationFn: () => saveKey({ data: { provider, apiKey } }),
    onSuccess: async () => {
      setApiKey("");
      await invalidateKeywordData();
      toast.success(`${providerLabels[provider]} API key saved securely.`);
    },
    onError: (error) => toast.error(error.message),
  });
  const removingKey = useMutation({
    mutationFn: (selectedProvider: (typeof SEO_KEYWORD_PROVIDERS)[number]) =>
      deleteKey({ data: { provider: selectedProvider } }),
    onSuccess: async () => {
      await invalidateKeywordData();
      toast.success("Provider key removed.");
    },
    onError: (error) => toast.error(error.message),
  });
  const generating = useMutation({
    mutationFn: () =>
      generateLongTail({
        data: { keyword: seedKeyword, country: generationCountry },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
      toast.success(`Generated ${result.generated}; saved ${result.inserted} new keywords.`);
    },
    onError: (error) => toast.error(error.message),
  });

  async function uploadCsv(file: File) {
    setUploading(true);
    let inserted = 0;
    try {
      const rows = await readKeywordCsv(file);
      for (let offset = 0; offset < rows.length; offset += UPLOAD_BATCH_SIZE) {
        const result = await importRows({
          data: { rows: rows.slice(offset, offset + UPLOAD_BATCH_SIZE) },
        });
        inserted += result.inserted;
      }
      await queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
      toast.success(`Processed ${rows.length} rows; inserted ${inserted} new pending keywords.`);
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ["seo-keywords"] });
      const message = error instanceof Error ? error.message : "CSV import failed.";
      throw new Error(
        inserted > 0
          ? `${message} The import stopped after inserting ${inserted} rows; earlier batches remain saved.`
          : message,
      );
    } finally {
      setUploading(false);
    }
  }

  async function submitProviderKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savingKey.mutateAsync();
  }

  const configuredProviders = new Set((providers.data ?? []).map((item) => item.provider));
  const count = keywords.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / 50));

  return (
    <section className="space-y-5" aria-labelledby="seo-keywords-heading">
      <header>
        <h2 id="seo-keywords-heading" className="font-display text-2xl font-bold tracking-tight">
          SEO Keywords
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate long-tail ideas, securely manage provider credentials, and import keyword
          research as pending review items.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-primary" /> Local AI generation
            </h3>
            <p className="text-sm text-muted-foreground">
              Generates up to 20 ideas using the configured loopback Ollama model.
            </p>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                generating.mutate();
              }}
            >
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                aria-label="Seed keyword"
                value={seedKeyword}
                maxLength={180}
                onChange={(event) => setSeedKeyword(event.target.value)}
              />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                aria-label="Generation country"
                value={generationCountry}
                onChange={(event) => setGenerationCountry(event.target.value)}
              >
                {SEO_KEYWORD_COUNTRIES.map((item) => (
                  <option key={item.country} value={item.country}>
                    {item.country}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={generating.isPending || seedKeyword.trim().length < 3}>
                {generating.isPending ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                Generate
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-primary" /> Provider API keys
            </h3>
            <p className="text-sm text-muted-foreground">
              Credentials are encrypted server-side and never returned to the browser. Add
              SEO_API_KEYS_ENCRYPTION_KEY to the server environment before saving. Provider
              request adapters remain disabled; saved keys do not trigger external API requests.
            </p>
            <form
              className="grid gap-3 sm:grid-cols-[0.8fr_1fr_auto]"
              onSubmit={(event) => void submitProviderKey(event)}
            >
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                aria-label="SEO provider"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as (typeof SEO_KEYWORD_PROVIDERS)[number])
                }
              >
                {SEO_KEYWORD_PROVIDERS.map((item) => (
                  <option key={item} value={item}>
                    {providerLabels[item]}
                  </option>
                ))}
              </select>
              <input
                type="password"
                autoComplete="new-password"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                aria-label="Provider API key"
                placeholder="Paste provider key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <Button type="submit" disabled={savingKey.isPending || apiKey.trim().length < 8}>
                {savingKey.isPending ? <LoaderCircle className="size-4 animate-spin" /> : "Save"}
              </Button>
            </form>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {SEO_KEYWORD_PROVIDERS.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span>
                    {providerLabels[item]}:{" "}
                    {configuredProviders.has(item) ? "Configured" : "Not configured"}
                  </span>
                  {configuredProviders.has(item) && (
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      disabled={removingKey.isPending}
                      onClick={() => removingKey.mutate(item)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Bulk upload CSV</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Required column: keyword. Optional: country, search_volume, difficulty, cpc, intent.
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={uploading}
              aria-label="Upload keyword CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void uploadCsv(file)
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "CSV import failed."),
                  )
                  .finally(() => {
                    if (fileInput.current) fileInput.current.value = "";
                  });
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              {uploading ? "Uploading…" : "Select CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
                aria-label="Search keywords"
                placeholder="Search keywords"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setSearch(query.trim());
                    setPage(1);
                  }
                }}
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              aria-label="Filter by country"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All countries</option>
              {SEO_KEYWORD_COUNTRIES.map((item) => (
                <option key={item.country} value={item.country}>
                  {item.country}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch(query.trim());
                setPage(1);
              }}
            >
              Search
            </Button>
          </div>

          {keywords.error && (
            <p role="alert" className="text-sm text-destructive">
              Could not load keywords: {keywords.error.message}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="p-3">Keyword</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Volume</th>
                  <th className="p-3">Difficulty</th>
                  <th className="p-3">CPC</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(keywords.data?.rows ?? []).map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="max-w-[360px] truncate p-3 font-medium" title={row.keyword}>
                      {row.keyword}
                    </td>
                    <td className="p-3">{row.country || "—"}</td>
                    <td className="p-3">{row.search_volume?.toLocaleString() ?? "—"}</td>
                    <td className="p-3">{row.difficulty ?? "—"}</td>
                    <td className="p-3">{row.cpc === null ? "—" : row.cpc.toFixed(2)}</td>
                    <td className="p-3 capitalize">{row.intent}</td>
                    <td className="p-3 capitalize">{row.status}</td>
                  </tr>
                ))}
                {!keywords.isPending && !keywords.error && keywords.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No keywords match these filters.
                    </td>
                  </tr>
                )}
                {keywords.isPending && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Loading keywords…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count.toLocaleString()} keywords · Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || keywords.isPending}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount || keywords.isPending}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
