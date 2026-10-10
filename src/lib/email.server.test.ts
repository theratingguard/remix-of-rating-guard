import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendReportEmail } from "./email.server";
import nodemailer from "nodemailer";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mail = vi.hoisted(() => ({ send: vi.fn(), close: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mail.send, close: mail.close })) },
}));
let directory: string;
const url = "https://ratingguard.online/reports/9c401517-d96f-498b-82d2-65b6d9b30e96.pdf";
describe("Owner-authorized SMTP share transport", () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ratingguard-email-test-"));
    vi.stubEnv("REPORT_PDF_DIRECTORY", directory);
    await writeFile(join(directory, "9c401517-d96f-498b-82d2-65b6d9b30e96.pdf"), "%PDF-fixture");
    vi.clearAllMocks();
    for (const [key, value] of Object.entries({
      SMTP_HOST: "smtp.fixture.invalid",
      SMTP_PORT: "587",
      SMTP_USER: "owner@fixture.invalid",
      SMTP_PASS: "unit-password",
      SMTP_FROM: "Rating Guard <owner@fixture.invalid>",
    }))
      vi.stubEnv(key, value);
    mail.send.mockResolvedValue({
      accepted: ["client@fixture.invalid"],
      rejected: [],
      messageId: "fixture-message",
    });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  it("attaches saved local bytes and reports SMTP acceptance, not delivered status", async () => {
    expect(await sendReportEmail("client@fixture.invalid", url, "Unit business")).toEqual({
      accepted: true,
      messageId: "fixture-message",
    });
    expect(mail.send.mock.calls[0]?.[0].attachments[0].content).toEqual(
      Buffer.from("%PDF-fixture"),
    );
    expect(mail.close).toHaveBeenCalledOnce();
  });
  it("rejects remote URLs and traversal before reading a file or opening SMTP", async () => {
    await expect(
      sendReportEmail("client@fixture.invalid", "https://evil.invalid/report.pdf", "Fixture"),
    ).rejects.toThrow("Invalid");
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it("surfaces unconfigured SMTP and rejected recipient errors", async () => {
    vi.stubEnv("SMTP_PASS", "");
    await expect(sendReportEmail("client@fixture.invalid", url, "Fixture")).rejects.toThrow(
      "unavailable",
    );
    vi.stubEnv("SMTP_PASS", "unit-password");
    mail.send.mockResolvedValueOnce({ accepted: [], rejected: ["client@fixture.invalid"] });
    await expect(sendReportEmail("client@fixture.invalid", url, "Fixture")).rejects.toThrow(
      "did not accept",
    );
    expect(mail.close).toHaveBeenCalledOnce();
  });
});
