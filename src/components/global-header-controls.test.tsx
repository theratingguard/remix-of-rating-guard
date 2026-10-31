import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("offers all supported African languages and omits Marathi", () => {
    render(<GlobalHeaderControls userId="client-languages" isSuperAdmin={false} isClient />);
    fireEvent.click(screen.getByRole("button", { name: "Language / भाषा" }));

    for (const language of ["Swahili", "Zulu", "Afrikaans", "Amharic", "Hausa"]) {
      expect(
        screen.getByRole("menuitemradio", { name: new RegExp(language) }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole("menuitemradio", { name: /Marathi/ })).not.toBeInTheDocument();
  });

  it("translates representative client page copy in supported languages", async () => {
    const pageCopy = [
      "Your overview",
      "New scan",
      "Reviews scanned",
      "Reports submitted",
      "Recent activity",
      "Date",
      "Business",
      "Action",
      "Status",
      "No scans yet",
      "Start your first scan",
      "Search business or report",
      "No matching reports",
      "Previous",
      "Next",
      "Account preferences",
      "Basic profile",
      "Save profile",
      "Change password",
      "Current password",
      "New password",
      "Update password",
    ];

    const measureTranslationCoverage = async (
      language: "hi" | "sw" | "zu" | "af" | "am" | "ha",
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
    await measureTranslationCoverage("sw", "Muhtasari wako");
    await measureTranslationCoverage("zu", "Isifinyezo sakho");
    await measureTranslationCoverage("af", "Jou oorsig");
    await measureTranslationCoverage("am", "የእርስዎ አጠቃላይ እይታ");
    await measureTranslationCoverage("ha", "Takaitaccen bayani");
  });
});
