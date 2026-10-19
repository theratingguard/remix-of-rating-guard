import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Users,
  type LucideIcon,
} from "lucide-react";

type PathTarget =
  | { to: "/join"; search: { ref: string } }
  | { to: "/reseller/register" }
  | { to: "/contact" }
  | { to: "/staff/register" };

type Path = {
  title: string;
  description: string;
  action: string;
  Icon: LucideIcon;
  target: PathTarget;
};

const paths: Path[] = [
  {
    title: "I am a Business Owner",
    description:
      "Track your Google Business Profile and review insights. Join directly or optionally enter a reseller referral code.",
    action: "Create client account",
    Icon: BriefcaseBusiness,
    target: { to: "/join", search: { ref: "" } },
  },
  {
    title: "I am a Reseller",
    description:
      "Apply for a white-label partnership. Plans start at $99/year; activation requires approval and confirmed payment.",
    action: "View reseller plans",
    Icon: CircleDollarSign,
    target: { to: "/reseller/register" },
  },
  {
    title: "I am a Staff Member",
    description: "Apply to join the team and support evidence-led review case handling.",
    action: "Start a staff application",
    Icon: Users,
    target: { to: "/staff/register" },
  },
];

function PathCard({ path, index }: { path: Path; index: number }) {
  const { title, description, action, Icon, target } = path;
  const className =
    "group flex min-h-72 flex-col rounded-3xl border border-card-border bg-card/80 p-6 shadow-soft backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-7";
  const style = { transitionDelay: `${index * 80}ms` };
  const content = (
    <>
      <span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary transition group-hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        {action}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </>
  );

  if (target.to === "/join") {
    return (
      <Link to="/join" search={target.search} className={className} style={style}>
        {content}
      </Link>
    );
  }
  if (target.to === "/contact") {
    return (
      <Link to="/contact" className={className} style={style}>
        {content}
      </Link>
    );
  }
  if (target.to === "/reseller/register") {
    return (
      <Link to="/reseller/register" className={className} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <Link to="/staff/register" className={className} style={style}>
      {content}
    </Link>
  );
}

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "Get Started — Rating Guard" },
      {
        name: "description",
        content: "Choose the Rating Guard account or application path that fits you.",
      },
    ],
  }),
  component: GetStartedPage,
});

function GetStartedPage() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-5xl rounded-full bg-primary/10 blur-[120px]"
      />
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <Link to="/auth" className="text-sm font-medium text-primary hover:underline">
            Already have an account? Login
          </Link>
        </div>

        <header className="mx-auto mt-14 max-w-2xl text-center sm:mt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Start with the right path
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            How would you like to get started?
          </h1>
          <p className="mt-4 text-muted-foreground sm:text-lg">
            Choose the option that best describes you. We’ll take you to the matching signup,
            application, or contact flow.
          </p>
        </header>

        <section aria-label="Choose your account type" className="mt-10 grid gap-4 md:grid-cols-3">
          {paths.map((path, index) => (
            <PathCard key={path.title} path={path} index={index} />
          ))}
        </section>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          Rating Guard provides review analysis and evidence organization, not guaranteed removals.
          Google makes all final policy decisions.
        </p>
      </div>
    </main>
  );
}
