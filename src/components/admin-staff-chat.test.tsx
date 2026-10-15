import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminStaffChat } from "./admin-staff-chat";

const mocks = vi.hoisted(() => ({
  accessLevel: "staff",
  messages: [
    {
      id: "message-1",
      staff_id: "staff-1",
      sender_id: "staff-1",
      sender_role: "staff",
      message: "I need help with this task.",
      created_at: "2026-10-16T00:00:00.000Z",
    },
  ],
  sendMessage: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "report-access-level") return { data: mocks.accessLevel };
    return { data: mocks.messages, isError: false, isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/report-access", () => ({
  reportAccessQuery: () => ({ queryKey: ["report-access-level"] }),
}));
vi.mock("@/lib/staff-dashboard.functions", () => ({
  getAdminStaffMessages: vi.fn(),
  sendAdminStaffMessage: mocks.sendMessage,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Admin staff chat", () => {
  beforeEach(() => {
    mocks.accessLevel = "staff";
    mocks.sendMessage.mockReset().mockResolvedValue({});
    mocks.invalidateQueries.mockReset();
  });

  afterEach(cleanup);

  it("does not render or enable the admin reply UI for staff", () => {
    render(<AdminStaffChat staffId="staff-1" staffName="Sam Staff" />);
    expect(screen.queryByRole("region", { name: "Admin Chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send reply" })).toBeNull();
  });

  it("lets superadmins read the staff thread and send a reply", async () => {
    mocks.accessLevel = "super_admin";
    render(<AdminStaffChat staffId="staff-1" staffName="Sam Staff" />);

    expect(screen.getByText("I need help with this task.")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reply to Sam Staff"), {
      target: { value: "I will review this task." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));

    await waitFor(() =>
      expect(mocks.sendMessage).toHaveBeenCalledWith({
        data: { staffId: "staff-1", message: "I will review this task." },
      }),
    );
  });
});
