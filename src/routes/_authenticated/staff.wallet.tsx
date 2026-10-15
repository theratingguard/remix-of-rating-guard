import { createFileRoute } from "@tanstack/react-router";
import { StaffWalletPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/staff/wallet")({
  component: StaffWalletPage,
});
