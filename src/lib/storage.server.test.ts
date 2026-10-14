import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage.server";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ratingguard-storage-test-"));
  vi.stubEnv("STORAGE_ROOT", root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("VPS storage filesystem", () => {
  it("uploads privately, reads, lists, and reports aggregate usage", async () => {
    const uploaded = await storage.upload(
      "reports/00000000-0000-4000-8000-000000000001",
      "test.txt",
      Buffer.from("report"),
    );
    expect(uploaded.size).toBe(6);
    expect(await storage.read("reports/00000000-0000-4000-8000-000000000001", "test.txt")).toEqual(
      Buffer.from("report"),
    );
    const download = await storage.readStream(
      "reports/00000000-0000-4000-8000-000000000001",
      "test.txt",
    );
    expect(Buffer.from(await new Response(download.stream).arrayBuffer())).toEqual(
      Buffer.from("report"),
    );
    expect(await storage.list("reports")).toMatchObject([
      {
        name: "test.txt",
        path: "00000000-0000-4000-8000-000000000001/test.txt",
        size: 6,
      },
    ]);
    expect(await storage.stats()).toMatchObject({
      totalFiles: 1,
      totalSize: 6,
      folders: { reports: { files: 1, size: 6 }, backups: { files: 0, size: 0 } },
    });
    expect(await readFile(uploaded.path)).toEqual(Buffer.from("report"));
  });

  it("rejects path traversal and invalid filenames", async () => {
    await expect(storage.upload("../outside", "test.txt", Buffer.from("x"))).rejects.toThrow(
      "Invalid storage folder",
    );
    await expect(storage.upload("reports", "../outside", Buffer.from("x"))).rejects.toThrow(
      "Invalid storage filename",
    );
  });

  it("removes only files older than the requested retention period", async () => {
    const folder = "temp";
    await storage.upload(folder, "old.txt", Buffer.from("old"));
    await storage.upload(folder, "new.txt", Buffer.from("new"));
    const old = new Date(Date.now() - 8 * 86_400_000);
    await utimes(join(root, folder, "old.txt"), old, old);
    expect(await storage.cleanupOlderThan(folder, 7)).toEqual({
      deletedFiles: 1,
      deletedBytes: 3,
    });
    expect(await storage.exists(folder, "old.txt")).toBe(false);
    expect(await storage.exists(folder, "new.txt")).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "does not follow symlinked storage directories",
    async () => {
      const outside = await mkdtemp(join(tmpdir(), "ratingguard-storage-outside-"));
      try {
        await mkdir(join(root, "reports"), { recursive: true });
        await writeFile(join(outside, "private.txt"), "outside");
        await symlink(outside, join(root, "reports", "linked"));
        await expect(storage.read("reports/linked", "private.txt")).rejects.toThrow(
          "non-directory entry",
        );
        await expect(storage.list("reports/linked")).rejects.toThrow("non-directory entry");
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
});
