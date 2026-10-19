import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mockProfile = vi.hoisted(() => ({ language: "en" }));

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
      data: queryKey[0] === "profile" ? mockProfile : notifications,
      isPending: false,
      error: null,
    });
  })(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/profile", () => ({ profileQuery: () => ({ queryKey: ["profile"] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  },
}));

import { GlobalHeaderControls } from "./global-header-controls";

afterEach(cleanup);

describe("GlobalHeaderControls", () => {
  it("renders notification, language, and chat controls with an unread count", () => {
    render(<GlobalHeaderControls userId="client-1" isSuperAdmin={false} isClient />);

    expect(screen.getByRole("button", { name: "Notifications: 1 new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language / भाषा" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chats" })).toHaveAttribute("href", "/chat");
  });

  it("translates more than half of representative client page copy", async () => {
    const pageCopy = [
      "Your overview",
      "Track review scans, prepared reports, and confirmed outcomes.",
      "New scan",
      "Reviews scanned",
      "1–2 star reviews",
      "Reports submitted",
      "Successful removals",
      "Recent activity",
      "Your latest business review scans",
      "Date",
      "Business",
      "Action",
      "Status",
      "No scans yet",
      "Start your first scan",
      "Your documents",
      "Search business or report",
      "No matching reports",
      "Download PDF",
      "Previous",
      "Next",
      "Account preferences",
      "Basic profile",
      "Your name and account email",
      "Save profile",
      "Change password",
      "Current password",
      "New password",
      "Confirm new password",
      "Update password",
      "Fetching reviews",
      "AI analysis",
      "Prepare report",
    ];

    const measureTranslationCoverage = async (
      language: "hi" | "mr",
      translatedSentinel: string,
    ) => {
      mockProfile.language = language;
      const { container, unmount } = render(
        <GlobalHeaderControls userId={`client-${language}`} isSuperAdmin={false} isClient />,
      );
      const fixture = document.createElement("section");
      for (const copy of pageCopy) {
        const paragraph = document.createElement("p");
        paragraph.textContent = copy;
        fixture.append(paragraph);
      }
      container.append(fixture);

      await waitFor(() => expect(fixture.textContent).toContain(translatedSentinel));
      const translatedCount = [...fixture.querySelectorAll("p")].filter(
        (paragraph, index) => paragraph.textContent !== pageCopy[index],
      ).length;
      expect(translatedCount / pageCopy.length).toBeGreaterThanOrEqual(0.5);
      unmount();
    };

    await measureTranslationCoverage("hi", "आपका अवलोकन");
    await measureTranslationCoverage("mr", "तुमचा आढावा");
  });
});
