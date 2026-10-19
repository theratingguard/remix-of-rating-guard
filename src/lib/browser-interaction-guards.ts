export function blockContextMenu(event: MouseEvent) {
  event.preventDefault();
}

export function blockBrowserShortcuts(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const commandKey = event.ctrlKey || event.metaKey;
  const blocksDevToolsShortcut =
    (commandKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
    (event.metaKey && event.altKey && ["i", "j", "c"].includes(key));
  const blocksShortcut =
    event.key === "F12" || blocksDevToolsShortcut || (commandKey && ["u", "s", "p"].includes(key));

  if (blocksShortcut) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function restrictCopyToReportPages(
  event: Pick<ClipboardEvent, "preventDefault">,
  pathname: string,
) {
  if (!/^\/(?:reports|scan-report)(?:\/|$)/.test(pathname)) event.preventDefault();
}
