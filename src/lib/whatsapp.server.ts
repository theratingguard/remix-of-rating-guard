export function whatsappShareAvailable() {
  const setting = process.env["WHATSAPP_SHARE_ENABLED"]?.trim().toLowerCase();
  return setting !== "false" && setting !== "0";
}
