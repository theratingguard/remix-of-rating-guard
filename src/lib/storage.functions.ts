import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORAGE_FOLDERS, validateStorageFilename, validateStorageFolder } from "./storage";
import { formatStorageSize, storage } from "./storage.server";

const folderSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (folder) => {
      try {
        validateStorageFolder(folder);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid storage folder." },
  );
const filenameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (filename) => {
      try {
        validateStorageFilename(filename);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid storage filename." },
  );
const base64Schema = z.string().min(4).max(33_554_432);

type StorageContext = {
  supabase: {
    rpc: (name: "report_access_level") => {
      throwOnError: () => PromiseLike<{ data: string }>;
    };
  };
  userId: string;
  claims: Record<string, unknown>;
};

async function isSuperAdmin(context: StorageContext) {
  return (await context.supabase.rpc("report_access_level").throwOnError()).data === "super_admin";
}

async function requireSuperAdmin(context: StorageContext) {
  if (!(await isSuperAdmin(context)))
    throw new Error("Access Denied: Storage management is Super Admin only.");
}

function fileUrl(folder: string, filename: string) {
  return `/api/storage/download?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`;
}

export const getStorageDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    const stats = await storage.stats();
    const files = (await storage.list("reports"))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      .slice(0, 50)
      .map((file) => {
        const parts = file.path.split("/");
        const folder = ["reports", ...parts.slice(0, -1)].join("/");
        const filename = parts.at(-1);
        return {
          ...file,
          url: filename ? fileUrl(folder, filename) : null,
        };
      });
    return {
      ...stats,
      formattedSize: formatStorageSize(stats.totalSize),
      folders: STORAGE_FOLDERS.map((name) => ({
        name,
        ...stats.folders[name],
        formattedSize: formatStorageSize(stats.folders[name].size),
      })),
      files,
    };
  });

export const listStorageFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ folder: folderSchema }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    return { files: await storage.list(data.folder) };
  });

export const uploadStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        folder: folderSchema,
        filename: filenameSchema,
        contentType: z.string().max(128).default("application/octet-stream"),
        base64: base64Schema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const parts = validateStorageFolder(data.folder);
    const admin = await isSuperAdmin(context);
    const targetFolder =
      parts.length === 1 && parts[0] === "reports" ? `reports/${context.userId}` : data.folder;
    const targetParts = validateStorageFolder(targetFolder);
    if (
      !admin &&
      (targetParts[0] !== "reports" || targetParts.length < 2 || targetParts[1] !== context.userId)
    ) {
      throw new Error("Access Denied: Uploads are limited to your own report folder.");
    }
    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.toString("base64") !== data.base64) throw new Error("Invalid base64 file content.");
    if (
      data.filename.toLowerCase().endsWith(".pdf") &&
      !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
    )
      throw new Error("PDF upload does not contain a valid PDF header.");
    const result = await storage.upload(targetFolder, data.filename, buffer);
    return {
      path: result.path,
      url: result.url,
      size: result.size,
      contentType: data.contentType,
      folder: targetFolder,
      createdAt: result.createdAt.toISOString(),
    };
  });

export const authorizeStorageFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ folder: folderSchema, filename: filenameSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const parts = validateStorageFolder(data.folder);
    const admin = await isSuperAdmin(context);
    if (parts[0] === "reports" && parts.length >= 2 && parts[1] === context.userId) {
      // Report files are readable by their owner.
    } else if (!admin) {
      throw new Error("Access Denied: This storage file is not available to your account.");
    }
    if (!(await storage.exists(data.folder, data.filename)))
      throw new Error("Storage file is unavailable.");
    return { folder: data.folder, filename: data.filename };
  });

export const deleteStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ folder: folderSchema, filename: filenameSchema }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context);
    return storage.delete(data.folder, data.filename);
  });

export const cleanupStorageTemp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    return storage.cleanupOlderThan("temp", 7);
  });

export const backupStorageDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    return storage.backupDatabase();
  });

export const exportStorageLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    return storage.exportLogs();
  });
