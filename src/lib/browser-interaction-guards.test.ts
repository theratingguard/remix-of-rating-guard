import { describe, expect, it } from "vitest";
import {
  blockBrowserShortcuts,
  blockContextMenu,
  restrictCopyToReportPages,
} from "./browser-interaction-guards";

describe("browser interaction guards", () => {
  it("blocks context menus", () => {
    const event = new MouseEvent("contextmenu", { cancelable: true });

    blockContextMenu(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ["F12", false, false, false, false],
    ["i", true, true, false, false],
    ["j", true, true, false, false],
    ["c", true, true, false, false],
    ["I", false, true, true, false],
    ["J", false, false, true, true],
    ["u", true, false, false, false],
    ["s", true, false, false, false],
    ["p", true, false, false, false],
  ])("blocks the %s browser shortcut", (key, ctrl, shift, meta, alt) => {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: ctrl,
      metaKey: meta,
      shiftKey: shift,
      altKey: alt,
      cancelable: true,
    });

    blockBrowserShortcuts(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.cancelBubble).toBe(true);
  });

  it("leaves regular keys alone", () => {
    const event = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, cancelable: true });

    blockBrowserShortcuts(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["/reports", "/reports/123", "/scan-report/123"])(
    "allows copying on report route %s",
    (pathname) => {
      const event = new Event("copy", { cancelable: true });

      restrictCopyToReportPages(event, pathname);

      expect(event.defaultPrevented).toBe(false);
    },
  );

  it.each(["/", "/dashboard", "/reporting"])("blocks copying on %s", (pathname) => {
    const event = new Event("copy", { cancelable: true });

    restrictCopyToReportPages(event, pathname);

    expect(event.defaultPrevented).toBe(true);
  });
});
