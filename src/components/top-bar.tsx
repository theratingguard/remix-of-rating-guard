import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, MapPin, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { profileQuery } from "@/lib/profile";

export function TopBar({
  search,
  onSearchChange,
  locations,
  location,
  onLocationChange,
  notifications,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  locations: string[];
  location: string;
  onLocationChange: (value: string) => void;
  notifications: number;
}) {
  const { data: profile } = useQuery(profileQuery());
  const name = profile?.name?.trim() || "Admin";

  return (
    <header className="surface mb-5 flex flex-wrap items-center gap-3 p-3">
      <label className="relative min-w-48 flex-1">
        <span className="sr-only">Search businesses, URLs, and reports</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search businesses, URLs, reports..."
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </label>
      <label className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Filter by location</span>
        <select
          aria-label="All locations"
          value={location}
          onChange={(event) => onLocationChange(event.target.value)}
          className="max-w-40 bg-transparent outline-none"
        >
          <option value="">All locations</option>
          {locations.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <Link
        to="/history"
        aria-label={notifications ? `${notifications} scan alerts` : "Scan alerts"}
        title={notifications ? `${notifications} failed or active scans` : "No scan alerts"}
        className="relative grid size-10 place-items-center rounded-lg border bg-background text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {notifications > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-risk-high px-1 text-[10px] font-bold text-white">
            {notifications > 99 ? "99+" : notifications}
          </span>
        )}
      </Link>
      <Link
        to="/profile"
        className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted"
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-32 truncate text-sm font-medium">{name}</span>
          <span className="block text-[11px] text-muted-foreground">Admin workspace</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </Link>
    </header>
  );
}
