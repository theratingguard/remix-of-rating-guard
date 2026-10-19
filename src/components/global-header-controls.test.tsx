import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (() => {
    const profile = { language: "en" };
    const notifications = {
      items: [
        {
          id: "message:1",
          title: "New chat message",
          description: "client: Hello",
          createdAt: "2026-01-01T12:00:00.000Z",
          target: "/chat",
        },
      ],
      errors: [],
    };
    return ({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[0] === "profile" ? profile : notifications,
      isPending: false,
      error: null,
    });
  })(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/profile", () => ({ profileQuery: () => ({ queryKey: ["profile"] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { GlobalHeaderControls } from "./global-header-controls";

afterEach(cleanup);

describe("GlobalHeaderControls", () => {
  it("renders notification, language, and chat controls with an unread count", () => {
    render(<GlobalHeaderControls userId="client-1" isSuperAdmin={false} isClient />);

    expect(screen.getByRole("button", { name: "Notifications: 1 new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language / भाषा" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chats" })).toHaveAttribute("href", "/chat");
  });
});
