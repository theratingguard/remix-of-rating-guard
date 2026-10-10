import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      ...mocks,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }),
    },
  },
}));
import { Route } from "@/routes/auth";

const Page = Route.options.component!;
describe("Authentication UI contract (unit tests, not production login evidence)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState({}, "", "/auth");
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.navigate.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  function credentials() {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "test-password-only" },
    });
  }

  it("shows provider errors instead of redirecting invalid login", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    render(<Page />);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("resends normal signup confirmation without creating a session", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" }),
    });
    mocks.resend.mockResolvedValue({ error: null });
    render(<Page />);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resend confirmation email" }));
    await waitFor(() =>
      expect(mocks.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "user@example.com",
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("verification link");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("recovers from network exceptions and re-enables submission", async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error("Network unavailable"));
    render(<Page />);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("requires email verification when signup returns no session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("status")).toHaveTextContent("verify your account");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("sends password recovery to the recovery flow on the current origin", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() =>
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
        redirectTo: `${window.location.origin}/auth?flow=recovery`,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists");
  });

  it("rejects expired recovery links without updating a password", async () => {
    window.history.replaceState({}, "", "/auth?flow=recovery");
    render(<Page />);
    await screen.findByRole("heading", { name: "Set a new password" });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "test-password-only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or expired");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
