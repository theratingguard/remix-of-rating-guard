import nodemailer from "nodemailer";
import { z } from "zod";
import { storage } from "./storage.server";

export function smtpConfigured() {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every((name) =>
    Boolean(process.env[name]),
  );
}
export async function sendTextEmail(recipient: string, subject: string, text: string) {
  z.string().email().parse(recipient);
  if (!smtpConfigured())
    throw new Error("Email is unavailable: configure verified server-side SMTP credentials.");
  const transport = createSmtpTransport();
  try {
    const result = await transport.sendMail({
      from: process.env["SMTP_FROM"],
      to: recipient,
      subject: subject.replace(/[\r\n]/g, " ").slice(0, 160),
      text,
    });
    if (!result.accepted?.includes(recipient) || result.rejected?.length)
      throw new Error("SMTP server did not accept the insights recipient.");
    return { accepted: true, messageId: String(result.messageId) };
  } finally {
    transport.close();
  }
}
function createSmtpTransport() {
  const port = z.coerce.number().int().min(1).max(65535).parse(process.env["SMTP_PORT"]);
  return nodemailer.createTransport({
    host: process.env["SMTP_HOST"],
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

export async function sendReportEmail(
  clientEmail: string,
  pdfUrl: string,
  businessName: string,
  userId: string,
) {
  z.string().email().parse(clientEmail);
  if (!smtpConfigured())
    throw new Error(
      "Email sharing is unavailable: configure verified server-side SMTP credentials.",
    );
  const url = new URL(z.string().url().parse(pdfUrl));
  const id = url.searchParams.get("filename")?.replace(/\.pdf$/, "");
  const folder = `reports/${userId}`;
  if (
    url.origin !== "https://ratingguard.online" ||
    url.pathname !== "/api/storage/download" ||
    url.searchParams.get("folder") !== folder ||
    !/^[0-9a-f-]{36}$/.test(id ?? "")
  )
    throw new Error("Invalid saved report PDF URL.");
  const reportId = z.string().uuid().parse(id);
  const content = await storage.read(folder, `${reportId}.pdf`);
  const transport = createSmtpTransport();
  try {
    const result = await transport.sendMail({
      from: process.env["SMTP_FROM"],
      to: clientEmail,
      subject: `Rating Guard report: ${businessName.replace(/[\r\n]/g, " ").slice(0, 120)}`,
      text: `Your Rating Guard report for ${businessName} is attached. This attachment is confidential; the sender is sharing a copy that cannot be revoked.\n\nhttps://ratingguard.online/reports/${reportId} (authorized login required)\n\nAI assessments are advisory, not guarantees of review removal.`,
      attachments: [
        {
          filename: `RPT-${reportId.replace(/-/g, "").slice(0, 8).toUpperCase()}.pdf`,
          content,
          contentType: "application/pdf",
        },
      ],
    });
    if (!result.accepted?.includes(clientEmail) || result.rejected?.length)
      throw new Error("SMTP server did not accept the report recipient.");
    return { accepted: true, messageId: String(result.messageId) };
  } finally {
    transport.close();
  }
}
