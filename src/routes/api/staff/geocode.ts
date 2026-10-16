import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rateLimitResponse, sensitiveApiRateLimit } from "@/lib/rate-limit.server";
import { logServerError } from "@/lib/errors.server";
import { logEvent } from "@/lib/logger.server";

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z.array(
    z.object({
      formatted_address: z.string(),
      address_components: z.array(z.object({ long_name: z.string(), types: z.array(z.string()) })),
    }),
  ),
});

export const Route = createFileRoute("/api/staff/geocode")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        if (Number(request.headers.get("content-length") ?? 0) > 2048)
          return Response.json({ error: "Request body is too large." }, { status: 413 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }
        const coordinates = coordinatesSchema.safeParse(body);
        if (!coordinates.success)
          return Response.json({ error: "Valid coordinates are required." }, { status: 400 });

        const key = process.env["GOOGLE_GEOCODING_API_KEY"];
        if (!key)
          return Response.json(
            { error: "Location address lookup is not configured." },
            { status: 503 },
          );

        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.searchParams.set(
          "latlng",
          `${coordinates.data.latitude},${coordinates.data.longitude}`,
        );
        url.searchParams.set("key", key);
        let response: Response;
        let geocodeBody: unknown;
        try {
          response = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok)
            return Response.json({ error: "Location address lookup failed." }, { status: 502 });
          geocodeBody = await response.json();
        } catch (error) {
          logServerError("staff.geocode", error);
          return Response.json(
            { error: "Location address lookup is temporarily unavailable." },
            { status: 502 },
          );
        }
        const geocode = geocodeResponseSchema.safeParse(geocodeBody);
        if (!geocode.success)
          return Response.json(
            { error: "Could not resolve an address for this location." },
            { status: 422 },
          );
        if (geocode.data.status === "REQUEST_DENIED") {
          logEvent(
            "error",
            "staff.geocode.denied",
            "Geocoding provider rejected the configured key",
          );
          return Response.json(
            { error: "Location lookup is misconfigured. Contact the administrator." },
            { status: 503 },
          );
        }
        if (geocode.data.status !== "OK" || !geocode.data.results[0])
          return Response.json(
            { error: "Could not resolve an address for this location." },
            { status: 422 },
          );

        const components = geocode.data.results[0].address_components;
        const find = (...types: string[]) =>
          components.find((component) => types.some((type) => component.types.includes(type)))
            ?.long_name ?? "";
        const city = find("locality", "postal_town", "administrative_area_level_2");
        const state = find("administrative_area_level_1");
        if (!city || !state)
          return Response.json(
            { error: "The location did not include a recognizable city and state." },
            { status: 422 },
          );

        return Response.json(
          {
            address: geocode.data.results[0].formatted_address,
            city,
            state,
            area: find("sublocality_level_1", "neighborhood"),
            pincode: find("postal_code"),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
