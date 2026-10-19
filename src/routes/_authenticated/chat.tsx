import { createFileRoute, Link } from "@tanstack/react-router";
import { InternalChat } from "@/components/internal-chat";
import { ClientLayout } from "@/components/client-layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

function ChatPage() {
  const { user, isClient, isReseller, isStaff, isSuperAdmin } = Route.useRouteContext();
  const role = isSuperAdmin ? "superadmin" : isReseller ? "reseller" : isStaff ? "staff" : "client";
  const chat = (
    <InternalChat
      userId={user.id}
      email={user.email ?? "Account"}
      role={role}
      isSuperAdmin={isSuperAdmin}
    />
  );

  if (isClient)
    return (
      <ClientLayout email={user.email ?? "Client account"} userId={user.id}>
        {chat}
      </ClientLayout>
    );
  if (isReseller) {
    return (
      <main className="mx-auto min-h-svh max-w-7xl space-y-4 bg-background px-4 py-5 text-foreground sm:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/reseller">Back to reseller dashboard</Link>
        </Button>
        {chat}
      </main>
    );
  }
  return chat;
}
