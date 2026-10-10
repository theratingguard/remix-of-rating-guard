import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AiControlPanel } from "./ai-control-panel";
import { defaultSettings } from "@/lib/settings";
const { load, save, test } = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), test: vi.fn() }));
vi.mock("@/lib/settings.functions", () => ({
  getAiControlPanel: load,
  saveAiSettings: save,
  runModelTests: test,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
describe("AI control panel", () => {
  it("loads stored controls, persists OFF, tests all, and saves explicit limits", async () => {
    load.mockResolvedValue({
      settings: defaultSettings,
      statuses: [
        {
          model: "claude",
          status: "billing",
          response_ms: 500,
          message: "Credits required",
          checked_at: "2026-10-10T00:00:00Z",
          cost_estimate_usd: null,
        },
      ],
    });
    save.mockImplementation(async ({ data }) => data);
    test.mockResolvedValue([]);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AiControlPanel />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Billing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Claude Sonnet enabled" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ data: { ...defaultSettings, claude_enabled: false } }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Test All Models" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test All Models" }));
    await waitFor(() => expect(test).toHaveBeenCalledWith({ data: { model: "all" } }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Test All Models" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bulk scan daily limit" }), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Limits" }));
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        data: { ...defaultSettings, bulk_daily_limit: 400 },
      }),
    );
  });
});
