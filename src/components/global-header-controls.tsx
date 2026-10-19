import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Globe2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Language = "en" | "hi" | "mr";
type NotificationTarget = "/chat" | "/admin/staff" | "/reports" | "/client/reports";
type HeaderNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  target: NotificationTarget;
};
type NotificationSource = {
  items: HeaderNotification[];
  errors: string[];
};

const languages: { id: Language; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
  { id: "mr", label: "Marathi", native: "मराठी" },
];

const translations: Record<Exclude<Language, "en">, Record<string, string>> = {
  hi: {
    Dashboard: "डैशबोर्ड",
    "URL Scanner": "URL स्कैनर",
    "Bulk URL Scan": "बल्क URL स्कैन",
    "Google Reviews": "Google समीक्षाएँ",
    "Risk Analysis": "जोखिम विश्लेषण",
    "Scan History": "स्कैन इतिहास",
    Reports: "रिपोर्ट",
    "Storage Manager": "स्टोरेज प्रबंधक",
    Settings: "सेटिंग्स",
    "Staff Approvals": "स्टाफ़ अनुमोदन",
    Resellers: "रीसेलर",
    "Staff Activity": "स्टाफ़ गतिविधि",
    Overview: "अवलोकन",
    "My Tasks": "मेरे कार्य",
    "Status Board": "स्थिति बोर्ड",
    Performance: "प्रदर्शन",
    Quality: "गुणवत्ता",
    Incentive: "प्रोत्साहन",
    Communication: "संचार",
    "My Activity": "मेरी गतिविधि",
    "Evidence Vault": "साक्ष्य संग्रह",
    Timeline: "समयरेखा",
    "Team Review": "टीम समीक्षा",
    Alerts: "अलर्ट",
    Profile: "प्रोफ़ाइल",
    Chats: "चैट",
    "Review Outcomes": "समीक्षा परिणाम",
    "Scan & Remove": "स्कैन और हटाएँ",
    "Settings / Profile": "सेटिंग्स / प्रोफ़ाइल",
    "Open menu": "मेनू खोलें",
    "Log out": "लॉग आउट",
    "Language / भाषा": "भाषा",
    Notifications: "सूचनाएँ",
    "No new notifications": "कोई नई सूचना नहीं",
    "Loading notifications…": "सूचनाएँ लोड हो रही हैं…",
    "Could not load notifications": "सूचनाएँ लोड नहीं हो सकीं",
    "New chat message": "नया चैट संदेश",
    "New staff registration": "नया स्टाफ़ पंजीकरण",
    "New report submitted": "नई रिपोर्ट जमा हुई",
    "View all notifications": "सभी सूचनाएँ देखें",
  },
  mr: {
    Dashboard: "डॅशबोर्ड",
    "URL Scanner": "URL स्कॅनर",
    "Bulk URL Scan": "बल्क URL स्कॅन",
    "Google Reviews": "Google पुनरावलोकने",
    "Risk Analysis": "जोखीम विश्लेषण",
    "Scan History": "स्कॅन इतिहास",
    Reports: "अहवाल",
    "Storage Manager": "स्टोरेज व्यवस्थापक",
    Settings: "सेटिंग्ज",
    "Staff Approvals": "कर्मचारी मंजुरी",
    Resellers: "रीसेलर",
    "Staff Activity": "कर्मचारी क्रियाकलाप",
    Overview: "आढावा",
    "My Tasks": "माझी कामे",
    "Status Board": "स्थिती फलक",
    Performance: "कामगिरी",
    Quality: "गुणवत्ता",
    Incentive: "प्रोत्साहन",
    Communication: "संवाद",
    "My Activity": "माझे क्रियाकलाप",
    "Evidence Vault": "पुरावा संग्रह",
    Timeline: "वेळापत्रक",
    "Team Review": "संघ पुनरावलोकन",
    Alerts: "सूचना",
    Profile: "प्रोफाइल",
    Chats: "चॅट",
    "Review Outcomes": "पुनरावलोकन परिणाम",
    "Scan & Remove": "स्कॅन आणि काढा",
    "Settings / Profile": "सेटिंग्ज / प्रोफाइल",
    "Open menu": "मेनू उघडा",
    "Log out": "बाहेर पडा",
    "Language / भाषा": "भाषा",
    Notifications: "सूचना",
    "No new notifications": "नवीन सूचना नाहीत",
    "Loading notifications…": "सूचना लोड होत आहेत…",
    "Could not load notifications": "सूचना लोड होऊ शकल्या नाहीत",
    "New chat message": "नवीन चॅट संदेश",
    "New staff registration": "नवीन कर्मचारी नोंदणी",
    "New report submitted": "नवीन अहवाल सादर",
    "View all notifications": "सर्व सूचना पहा",
  },
};

const originalText = new WeakMap<Text, { source: string; translated: string }>();
const originalAttributes = new WeakMap<
  Element,
  Map<string, { source: string; translated: string }>
>();

function translateText(value: string, language: Language) {
  return language === "en" ? value : (translations[language][value] ?? value);
}

function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language;

  const translate = (root: Node) => {
    const updateText = (textNode: Text) => {
      const previous = originalText.get(textNode);
      const current = textNode.data;
      const source = previous && current === previous.translated ? previous.source : current;
      const translated = translateText(source, language);
      if (translated !== current) textNode.data = translated;
      originalText.set(textNode, { source, translated });
    };
    if (root instanceof Text) updateText(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) updateText(textNode);

    const elements =
      root instanceof Element
        ? [root, ...root.querySelectorAll("*")]
        : [...(root as ParentNode).childNodes].flatMap((child) =>
            child instanceof Element ? [child, ...child.querySelectorAll("*")] : [],
          );
    for (const element of elements) {
      const values = originalAttributes.get(element) ?? new Map();
      for (const attribute of ["aria-label", "placeholder", "title"]) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const previous = values.get(attribute);
        const source = previous && value === previous.translated ? previous.source : value;
        const translated = translateText(source, language);
        if (translated !== value) element.setAttribute(attribute, translated);
        values.set(attribute, { source, translated });
      }
      originalAttributes.set(element, values);
    }
  };

  translate(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && record.target instanceof Text) {
        const current = record.target.data;
        const previous = originalText.get(record.target);
        const source = previous && current === previous.translated ? previous.source : current;
        const translated = translateText(source, language);
        if (translated !== current) {
          originalText.set(record.target, { source, translated });
          record.target.data = translated;
        }
      } else {
        for (const node of record.addedNodes) {
          if (node instanceof Element || node instanceof Text) translate(node);
        }
        if (record.type === "attributes" && record.target instanceof Element) {
          translate(record.target);
        }
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "placeholder", "title"],
  });
  return () => observer.disconnect();
}

function notificationSeenStorageKey(userId: string) {
  return `rating-guard:notifications:seen:${userId}`;
}

function readSeenNotifications(userId: string) {
  try {
    const saved = localStorage.getItem(notificationSeenStorageKey(userId));
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set<string>();
  }
}

async function loadNotifications(
  userId: string,
  isSuperAdmin: boolean,
  isClient: boolean,
): Promise<NotificationSource> {
  const errors: string[] = [];
  const requests: PromiseLike<HeaderNotification[]>[] = [
    supabase
      .from("internal_messages")
      .select("id,sender_role,message,created_at")
      .eq("receiver_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) {
          errors.push("Chat notifications are unavailable.");
          return [];
        }
        return data.map((message) => ({
          id: `message:${message.id}`,
          title: "New chat message",
          description: `${message.sender_role}: ${message.message.slice(0, 120)}`,
          createdAt: message.created_at,
          target: "/chat" as const,
        }));
      }),
  ];

  if (isSuperAdmin) {
    requests.push(
      supabase
        .from("staff")
        .select("id,name,status,created_at")
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data, error }) => {
          if (error) {
            errors.push("Staff registration notifications are unavailable.");
            return [];
          }
          return data.map((staff) => ({
            id: `staff:${staff.id}`,
            title: "New staff registration",
            description: `${staff.name} · ${staff.status}`,
            createdAt: staff.created_at,
            target: "/admin/staff" as const,
          }));
        }),
    );
  }

  if (isSuperAdmin || isClient) {
    let reportsQuery = supabase
      .from("reports")
      .select("id,report_number,status,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (isClient) reportsQuery = reportsQuery.eq("user_id", userId);
    requests.push(
      reportsQuery.then(({ data, error }) => {
        if (error) {
          errors.push("Report notifications are unavailable.");
          return [];
        }
        return data.map((report) => ({
          id: `report:${report.id}`,
          title: "New report submitted",
          description: `${report.report_number} · ${report.status}`,
          createdAt: report.created_at,
          target: isSuperAdmin ? "/reports" : "/client/reports",
        }));
      }),
    );
  }

  const settled = await Promise.all(requests);
  return {
    items: settled
      .flat()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 10),
    errors,
  };
}

export function GlobalHeaderControls({
  userId,
  isSuperAdmin,
  isClient,
}: {
  userId: string;
  isSuperAdmin: boolean;
  isClient: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(profileQuery());
  const [language, setLanguage] = useState<Language>("en");
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenNotifications(userId));
  const notifications = useQuery({
    queryKey: ["global-notifications", userId, isSuperAdmin, isClient],
    queryFn: () => loadNotifications(userId, isSuperAdmin, isClient),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const saved = profile?.language;
    if (saved === "hi" || saved === "mr" || saved === "en") setLanguage(saved);
  }, [profile?.language]);

  useEffect(() => applyDocumentLanguage(language), [language]);

  useEffect(() => {
    if (!notifications.data) return;
    const key = notificationSeenStorageKey(userId);
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) {
        const baseline = notifications.data.items
          .filter((item) => !item.id.startsWith("message:"))
          .map((item) => item.id);
        localStorage.setItem(key, JSON.stringify(baseline));
        setSeenIds(new Set(baseline));
      } else {
        setSeenIds(readSeenNotifications(userId));
      }
    } catch {
      setSeenIds(new Set());
    }
  }, [notifications.data, userId]);

  const unseenCount = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => !seenIds.has(item.id)).length,
    [notifications.data?.items, seenIds],
  );
  const translated = (value: string) => translateText(value, language);

  async function selectLanguage(next: string) {
    if (next !== "en" && next !== "hi" && next !== "mr") return;
    setLanguage(next);
    const { error } = await supabase
      .from("profiles")
      .update({ language: next, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      setLanguage(
        profile?.language === "hi" || profile?.language === "mr" ? profile.language : "en",
      );
      toast.error("Could not save language preference. Please try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  function markSeenAndNavigate(item: HeaderNotification) {
    const next = new Set(seenIds);
    next.add(item.id);
    setSeenIds(next);
    try {
      localStorage.setItem(
        notificationSeenStorageKey(userId),
        JSON.stringify([...next].slice(-500)),
      );
    } catch {
      // Notification navigation should still work when storage is unavailable.
    }
    void navigate({ to: item.target });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              unseenCount
                ? `${translated("Notifications")}: ${unseenCount} new`
                : translated("Notifications")
            }
            title={translated("Notifications")}
            className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="size-5" aria-hidden />
            {unseenCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unseenCount > 99 ? "99+" : unseenCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
          <DropdownMenuLabel>{translated("Notifications")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.isPending && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {translated("Loading notifications…")}
            </p>
          )}
          {notifications.error && (
            <p role="alert" className="px-2 py-4 text-sm text-destructive">
              {translated("Could not load notifications")}
            </p>
          )}
          {notifications.data?.items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => markSeenAndNavigate(item)}
              className="cursor-pointer items-start gap-3 whitespace-normal py-3"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${seenIds.has(item.id) ? "bg-muted" : "bg-red-600"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{translated(item.title)}</span>
                <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                  {item.description}
                </span>
                <time className="mt-1 block text-[10px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </span>
              {seenIds.has(item.id) && <Check className="mt-1 size-3 text-muted-foreground" />}
            </DropdownMenuItem>
          ))}
          {notifications.data?.items.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {translated("No new notifications")}
            </p>
          )}
          {(notifications.data?.errors.length ?? 0) > 0 && (
            <p role="status" className="px-2 py-2 text-xs text-amber-700">
              {notifications.data?.errors.join(" ")}
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void navigate({ to: isSuperAdmin ? "/admin/staff" : "/chat" })}
          >
            {translated("View all notifications")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={translated("Language / भाषा")}
            title={translated("Language / भाषा")}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Globe2 className="size-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>{translated("Language / भाषा")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value) => void selectLanguage(value)}
          >
            {languages.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                <span>{item.label}</span>
                {item.id !== "en" && (
                  <span className="ml-auto text-muted-foreground">{item.native}</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Link
        to="/chat"
        aria-label={translated("Chats")}
        title={translated("Chats")}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
