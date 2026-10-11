(function () {
  globalThis.ratingGuardSessionToken = function (token, now = Date.now()) {
    if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw new Error("Use a signed-in user session JWT, not an API secret.");
    let claims;
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      claims = JSON.parse(atob(encoded));
    } catch {
      throw new Error("Malformed session token.");
    }
    if (
      claims.role !== "authenticated" ||
      typeof claims.sub !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= now ||
      claims.exp * 1000 > now + 24 * 60 * 60000
    )
      throw new Error(
        "Use a current short-lived authenticated user session, never an admin/service-role token.",
      );
    // Shape checks are not authentication; the Rating Guard API verifies the signature and access.
    return token;
  };
})();
