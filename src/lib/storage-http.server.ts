export function storageErrorResponse(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : "Storage operation failed.";
  console.error(`[storage-${operation}]`, message);
  const status = /Unauthorized/.test(message)
    ? 401
    : /Access Denied/.test(message)
      ? 403
      : /ENOENT|unavailable|expired/.test(message)
        ? 404
        : /DATABASE_URL|pg_dump/.test(message)
          ? 503
          : /Invalid|must be|outside the configured root/.test(message)
            ? 400
            : 500;
  return Response.json(
    { error: status === 500 ? "Storage operation failed." : message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
