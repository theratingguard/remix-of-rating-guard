export const BUSINESS_SEARCH_LIMIT_PER_HOUR = 30;

type ReserveBusinessSearch = () => PromiseLike<{
  error: { message: string } | null;
}>;

export async function reserveBusinessSearchSlot(reserve: ReserveBusinessSearch): Promise<void> {
  let error: { message: string } | null;
  try {
    ({ error } = await reserve());
  } catch (cause) {
    console.error("[business-search] rate-limit admission failed", cause);
    throw new Error("Business search is temporarily unavailable. Try again later.");
  }
  if (!error) return;

  if (/business search rate limit exceeded/i.test(error.message)) {
    throw new Error(
      `Business search limit reached (${BUSINESS_SEARCH_LIMIT_PER_HOUR} per hour). Try again later.`,
    );
  }

  console.error("[business-search] rate-limit admission failed", error);
  throw new Error("Business search is temporarily unavailable. Try again later.");
}
