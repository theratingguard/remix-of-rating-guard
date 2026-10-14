// Official Google Places API (New) integration boundary.
// Requires GOOGLE_PLACES_API_KEY. Google returns at most 5 reviews per place.
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  GOOGLE_SHORT_HOSTS,
  isGoogleMapsUrl,
  isGoogleReviewUrl,
  isGoogleShareBridge,
} from "./google-url";

const placeSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().optional(),
  addressComponents: z
    .array(
      z.object({
        longText: z.string().optional(),
        shortText: z.string().optional(),
        types: z.array(z.string()),
      }),
    )
    .optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  googleMapsUri: z.string().optional(),
  primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  reviews: z
    .array(
      z.object({
        authorAttribution: z
          .object({ displayName: z.string().optional(), uri: z.string().optional() })
          .optional(),
        rating: z.number().int().min(1).max(5),
        publishTime: z.string().optional(),
        relativePublishTimeDescription: z.string().optional(),
        text: z.object({ text: z.string() }).optional(),
        originalText: z.object({ text: z.string() }).optional(),
        googleMapsUri: z.string().optional(),
      }),
    )
    .max(5)
    .optional(),
});
const searchSchema = z.object({
  places: z
    .array(z.object({ id: z.string().min(1), googleMapsUri: z.string().optional() }))
    .optional(),
});

export class ScanError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type PlaceReview = {
  author: string;
  authorUri: string | null;
  rating: number;
  publishedAt: string | null;
  relativeTime: string | null;
  text: string;
  reviewUri: string | null;
};

export type PlaceResult = {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  countryCode?: string | null;
  rating: number | null;
  totalReviews: number | null;
  mapsUri: string | null;
  latitude: number | null;
  longitude: number | null;
  reviews: PlaceReview[];
};

const BASE = "https://places.googleapis.com/v1";

async function googleFetch(
  apiKey: string,
  path: string,
  init: RequestInit & { fieldMask: string },
) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": init.fieldMask,
      },
    });
  } catch {
    throw new ScanError("NETWORK", "Could not reach Google. Check your connection and try again.");
  }
  if (res.status === 429)
    throw new ScanError("RATE_LIMIT", "Google rate limit reached. Wait a minute and try again.");
  if (res.status === 403 || res.status === 401) {
    throw new ScanError(
      "API_UNAVAILABLE",
      "Google denied this request. Check the server API key, Places API (New), application restrictions and billing.",
    );
  }
  if (res.status === 404) throw new ScanError("NOT_FOUND", "Business not found on Google.");
  if (res.status >= 500)
    throw new ScanError(
      "GOOGLE_ERROR",
      "Google service is temporarily unavailable. Try again shortly.",
    );
  if (!res.ok) {
    throw new ScanError(
      "GOOGLE_ERROR",
      `Google request failed [${res.status}]. Check the server key and request configuration.`,
    );
  }
  try {
    return await res.json();
  } catch {
    throw new ScanError(
      "INVALID_PROVIDER_DATA",
      "Google returned an unreadable response. No review data was substituted.",
    );
  }
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a !== undefined &&
      b !== undefined &&
      a !== 0 &&
      a !== 10 &&
      a !== 127 &&
      a < 224 &&
      !(a === 169 && b === 254) &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && b === 168) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && (b === 18 || b === 19))
    );
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}

async function expandShortLink(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 5; i++) {
    const u = new URL(cur);
    if (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname === "consent.google.com" &&
      u.searchParams.get("continue")
    ) {
      cur = u.searchParams.get("continue")!;
      continue;
    }
    if (!isGoogleMapsUrl(cur))
      throw new ScanError(
        "RESOLVE_FAILED",
        `Short link redirected to a non-Google host (${u.hostname}).`,
      );
    if (!GOOGLE_SHORT_HOSTS.has(u.hostname) && !isGoogleShareBridge(u)) return cur;
    let addresses;
    try {
      addresses = await lookup(u.hostname, { all: true });
    } catch {
      throw new ScanError("RESOLVE_FAILED", "Google short-link DNS could not be resolved.");
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new ScanError("RESOLVE_FAILED", "Short link resolved to a non-public network address.");
    }
    let res: Response;
    try {
      res = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ScanError(
        "RESOLVE_FAILED",
        "Valid short link, but Google did not answer the redirect in time. Try again.",
      );
    }
    const loc = res.headers.get("location");
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    if (res.status >= 300 && res.status < 400 && loc) {
      cur = new URL(loc, cur).toString();
      continue;
    }
    if (res.status >= 400)
      throw new ScanError(
        "RESOLVE_FAILED",
        `Valid short link, but Google returned ${res.status} while resolving it.`,
      );
    return cur;
  }
  throw new ScanError("RESOLVE_FAILED", "Short link had too many redirects.");
}

type Parsed = { placeId?: string; query?: string; lat?: number; lng?: number; cid?: string };

export function parseMapsUrl(raw: string): Parsed {
  const url = new URL(raw);
  const p = url.searchParams;
  const pid = p.get("query_place_id") || p.get("place_id") || p.get("cid_place_id");
  if (pid) return { placeId: pid };
  const q = p.get("q") || p.get("query");
  if (q?.startsWith("place_id:")) return { placeId: q.slice(9) };
  const out: Parsed = {};
  const decodedPath = decodeURIComponent(url.pathname);
  const embeddedId = decodedPath.match(/!1s(ChIJ[A-Za-z0-9_-]+)/)?.[1];
  if (embeddedId) return { placeId: embeddedId };
  const hexCid = decodedPath.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i)?.[1];
  const cidParam = p.get("cid");
  if (hexCid) out.cid = BigInt(`0x${hexCid}`).toString(10);
  else if (cidParam && /^\d+$/.test(cidParam)) out.cid = cidParam;
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) out.query = decodeURIComponent((placeMatch[1] ?? "").replace(/\+/g, " "));
  else if (q) out.query = q;
  // Place coordinates identify the business; @ coordinates may only be the camera centre.
  const number = "(-?\\d+(?:\\.\\d+)?)";
  const at =
    decodedPath.match(new RegExp(`!3d${number}!4d${number}`)) ??
    decodedPath.match(new RegExp(`@${number},${number}`));
  if (at) {
    out.lat = Number(at[1]);
    out.lng = Number(at[2]);
    if (Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180)
      throw new ScanError("INVALID_URL", "Google Maps coordinates are outside their valid range.");
  }
  return out;
}

const DETAILS_MASK =
  "id,displayName,formattedAddress,addressComponents,rating,userRatingCount,googleMapsUri,primaryTypeDisplayName,reviews,location";

export async function searchBusinesses(apiKey: string, query: string) {
  const result = z
    .object({
      places: z
        .array(
          z.object({
            id: z.string().min(1),
            displayName: z.object({ text: z.string().min(1) }),
            formattedAddress: z.string().optional(),
          }),
        )
        .max(5)
        .optional(),
    })
    .safeParse(
      await googleFetch(apiKey, "/places:searchText", {
        method: "POST",
        body: JSON.stringify({ textQuery: query, pageSize: 5 }),
        fieldMask: "places.id,places.displayName,places.formattedAddress",
      }),
    );
  if (!result.success)
    throw new ScanError("GOOGLE_ERROR", "Google returned invalid business search results.");
  return (result.data.places ?? []).map((place) => ({
    name: place.displayName.text,
    address: place.formattedAddress ?? "Address unavailable",
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName.text)}&query_place_id=${encodeURIComponent(place.id)}`,
  }));
}

export async function resolveAndFetchPlace(
  apiKey: string,
  inputUrl: string,
  cidLookup?: (cid: string) => Promise<string | null>,
): Promise<PlaceResult> {
  let url = inputUrl.trim();
  if (!isGoogleMapsUrl(url))
    throw new ScanError("INVALID_URL", "Use a supported HTTPS Google Maps business link.");
  if (GOOGLE_SHORT_HOSTS.has(new URL(url).hostname) || isGoogleShareBridge(new URL(url)))
    url = await expandShortLink(url);
  let parsed: Parsed;
  try {
    parsed = parseMapsUrl(url);
  } catch {
    throw new ScanError("INVALID_URL", "That doesn't look like a valid Google Maps link.");
  }

  let placeId = parsed.placeId;
  if (!placeId && parsed.cid && cidLookup) {
    // Known business: Google's own googleMapsUri (stored earlier) carries this CID.
    placeId = (await cidLookup(parsed.cid)) ?? undefined;
  }
  if (!placeId && parsed.cid && !parsed.query) {
    const { resolveCidBusinessName } = await import("./google-cid.server");
    parsed.query = await resolveCidBusinessName(parsed.cid);
  }
  if (!placeId) {
    if (!parsed.query)
      throw new ScanError(
        "INVALID_URL",
        isGoogleReviewUrl(url)
          ? "This is a specific review link, but it does not identify a business that Google Places can resolve. Open the review's business page and scan its business URL instead."
          : "Couldn't find a business in that link. Open the business on Google Maps and copy its link.",
      );
    const body: Record<string, unknown> = {
      textQuery: parsed.query,
      pageSize: parsed.cid ? 5 : 1,
    };
    if (parsed.lat != null && parsed.lng != null) {
      body["locationBias"] = {
        circle: { center: { latitude: parsed.lat, longitude: parsed.lng }, radius: 2000 },
      };
    }
    const parsedSearch = searchSchema.safeParse(
      await googleFetch(apiKey, "/places:searchText", {
        method: "POST",
        body: JSON.stringify(body),
        fieldMask: "places.id,places.googleMapsUri",
      }),
    );
    if (!parsedSearch.success)
      throw new ScanError(
        "INVALID_PROVIDER_DATA",
        "Google returned an unsupported search response. No business was selected.",
      );
    const search = parsedSearch.data;
    if (parsed.cid) {
      placeId = search.places?.find((candidate) => {
        if (!candidate.googleMapsUri) return false;
        try {
          return parseMapsUrl(candidate.googleMapsUri).cid === parsed.cid;
        } catch {
          return false;
        }
      })?.id;
      if (!placeId)
        throw new ScanError(
          "NOT_FOUND",
          "Google search did not return the business identified by this link. No nearby business was substituted.",
        );
    } else placeId = search.places?.[0]?.id;
    if (!placeId)
      throw new ScanError("NOT_FOUND", "Business not found on Google. Try a different link.");
  }

  const parsedPlace = placeSchema.safeParse(
    await googleFetch(apiKey, `/places/${encodeURIComponent(placeId)}`, {
      method: "GET",
      fieldMask: DETAILS_MASK,
    }),
  );
  if (!parsedPlace.success)
    throw new ScanError(
      "INVALID_PROVIDER_DATA",
      "Google returned incomplete or invalid place/review data. No synthetic reviews were substituted.",
    );
  const d = parsedPlace.data;
  const reviews: PlaceReview[] = (d.reviews ?? []).map((r) => ({
    author: r.authorAttribution?.displayName ?? "Google user",
    authorUri: r.authorAttribution?.uri ?? null,
    rating: r.rating,
    publishedAt: r.publishTime ?? null,
    relativeTime: r.relativePublishTimeDescription ?? null,
    text: r.text?.text ?? r.originalText?.text ?? "",
    reviewUri: r.googleMapsUri ?? null,
  }));
  return {
    placeId: d.id,
    name: d.displayName.text,
    category: d.primaryTypeDisplayName?.text ?? null,
    address: d.formattedAddress ?? null,
    countryCode:
      d.addressComponents?.find((component) => component.types.includes("country"))?.shortText ??
      null,
    rating: d.rating ?? null,
    totalReviews: d.userRatingCount ?? null,
    mapsUri: d.googleMapsUri ?? null,
    latitude: d.location?.latitude ?? null,
    longitude: d.location?.longitude ?? null,
    reviews,
  };
}
