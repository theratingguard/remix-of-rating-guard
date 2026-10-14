import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { basename, join, relative, resolve, sep } from "node:path";
import { STORAGE_FOLDERS, validateStorageFilename, validateStorageFolder } from "./storage";

const storageRoot = () => resolve(process.env["STORAGE_ROOT"] || "/opt/ratingguard-storage");
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function resolveStoragePath(folder: string, filename?: string) {
  const segments = validateStorageFolder(folder);
  const safeFilename = filename === undefined ? undefined : validateStorageFilename(filename);
  const root = storageRoot();
  const path = resolve(root, ...segments, ...(safeFilename ? [safeFilename] : []));
  if (path !== root && !path.startsWith(`${root}${sep}`))
    throw new Error("Storage path is outside the configured root.");
  return path;
}

function resolveListedFilePath(folder: string, filePath: string) {
  const parts = filePath.split("/");
  if (parts.length < 1 || parts.some((part) => !part))
    throw new Error("Invalid storage file path.");
  const filename = validateStorageFilename(parts.pop()!);
  return resolveStoragePath([...validateStorageFolder(folder), ...parts].join("/"), filename);
}

async function ensureSafeDirectory(folder: string) {
  const segments = validateStorageFolder(folder);
  const root = storageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("Storage path contains a non-directory entry.");
  await chmod(root, 0o700);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const currentStat = await lstat(current);
      if (!currentStat.isDirectory() || currentStat.isSymbolicLink())
        throw new Error("Storage path contains a non-directory entry.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
    }
    await chmod(current, 0o700);
  }
}

async function assertSafeDirectoryPath(folder: string) {
  const root = storageRoot();
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      throw new Error("Storage path contains a non-directory entry.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  let current = root;
  for (const segment of validateStorageFolder(folder)) {
    current = join(current, segment);
    try {
      const currentStat = await lstat(current);
      if (!currentStat.isDirectory() || currentStat.isSymbolicLink())
        throw new Error("Storage path contains a non-directory entry.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
  }
}

async function walkFiles(directory: string, base = directory): Promise<StorageFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: StorageFile[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path, base)));
    } else if (entry.isFile()) {
      const fileStat = await stat(path);
      files.push({
        name: entry.name,
        path: relative(base, path).split(sep).join("/"),
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      });
    }
  }
  return files;
}

export type StorageFile = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
};

export type StorageDirectoryStats = {
  files: number;
  size: number;
};

export function formatStorageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export const storage = {
  async upload(folder: string, filename: string, buffer: Buffer) {
    validateStorageFilename(filename);
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES)
      throw new Error("File must be between 1 byte and 24 MB.");
    await ensureSafeDirectory(folder);
    const directory = resolveStoragePath(folder);
    const filePath = resolveStoragePath(folder, filename);
    const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, buffer, { flag: "wx", mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    const fileStat = await stat(filePath);
    return {
      path: filePath,
      size: fileStat.size,
      createdAt: fileStat.birthtime,
      url: `/api/storage/download?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`,
    };
  },

  async read(folder: string, filename: string) {
    await assertSafeDirectoryPath(folder);
    const filePath = resolveStoragePath(folder, filename);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink())
      throw new Error("Storage file is unavailable.");
    const handle = await open(filePath, "r");
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  },

  async readStream(folder: string, filename: string) {
    await assertSafeDirectoryPath(folder);
    const filePath = resolveStoragePath(folder, filename);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink())
      throw new Error("Storage file is unavailable.");
    const handle = await open(filePath, "r");
    return {
      stream: Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>,
      size: fileStat.size,
    };
  },

  async delete(folder: string, filename: string) {
    await assertSafeDirectoryPath(folder);
    await unlink(resolveStoragePath(folder, filename));
    return { deleted: true };
  },

  async exists(folder: string, filename: string) {
    try {
      await assertSafeDirectoryPath(folder);
      const fileStat = await lstat(resolveStoragePath(folder, filename));
      return fileStat.isFile() && !fileStat.isSymbolicLink();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  },

  async list(folder: string) {
    await assertSafeDirectoryPath(folder);
    return walkFiles(resolveStoragePath(folder));
  },

  async stats() {
    const folders: Record<(typeof STORAGE_FOLDERS)[number], StorageDirectoryStats> = {
      reports: { files: 0, size: 0 },
      backups: { files: 0, size: 0 },
      temp: { files: 0, size: 0 },
    };
    for (const folder of STORAGE_FOLDERS) {
      await assertSafeDirectoryPath(folder);
      const files = await walkFiles(resolveStoragePath(folder));
      folders[folder] = {
        files: files.length,
        size: files.reduce((total, file) => total + file.size, 0),
      };
    }
    const totalFiles = Object.values(folders).reduce((total, folder) => total + folder.files, 0);
    const totalSize = Object.values(folders).reduce((total, folder) => total + folder.size, 0);
    return {
      totalFiles,
      totalSize,
      formattedSize: formatStorageSize(totalSize),
      root: storageRoot(),
      folders,
    };
  },

  async cleanupOlderThan(folder: string, days: number) {
    validateStorageFolder(folder);
    if (folder.includes("/") || !Number.isInteger(days) || days < 1 || days > 365)
      throw new Error("Invalid cleanup request.");
    await assertSafeDirectoryPath(folder);
    const files = await walkFiles(resolveStoragePath(folder));
    const cutoff = Date.now() - days * 86_400_000;
    const removed: StorageFile[] = [];
    for (const file of files) {
      if (Date.parse(file.modifiedAt) >= cutoff) continue;
      await unlink(resolveListedFilePath(folder, file.path));
      removed.push(file);
    }
    return {
      deletedFiles: removed.length,
      deletedBytes: removed.reduce((total, file) => total + file.size, 0),
    };
  },

  async backupDatabase() {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl)
      throw new Error("Database backup is unavailable: DATABASE_URL is not configured.");
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.password)
      throw new Error("Database backup requires a PostgreSQL URL with a password.");
    const pgDumpPath = process.env["PG_DUMP_PATH"] || "pg_dump";
    const filename = `ratingguard-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
    const folder = "backups";
    await ensureSafeDirectory(folder);
    const directory = resolveStoragePath(folder);
    const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
    const filePath = resolveStoragePath(folder, filename);
    const child = spawn(
      pgDumpPath,
      ["--no-owner", "--no-privileges", "--format=custom", "--file", temporaryPath],
      {
        shell: false,
        stdio: ["ignore", "ignore", "ignore"],
        env: {
          ...process.env,
          PGHOST: parsed.hostname,
          PGPORT: parsed.port || "5432",
          PGUSER: decodeURIComponent(parsed.username),
          PGPASSWORD: decodeURIComponent(parsed.password),
          PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
          PGSSLMODE: parsed.searchParams.get("sslmode") || "require",
        },
      },
    );
    try {
      const exitCode = await new Promise<number>((resolveExit, reject) => {
        child.once("error", reject);
        child.once("close", (code) =>
          code === 0 ? resolveExit(0) : reject(new Error(`pg_dump exited with status ${code}.`)),
        );
      });
      if (exitCode !== 0) throw new Error("Database backup failed.");
      const fileStat = await stat(temporaryPath);
      if (fileStat.size === 0) throw new Error("Database backup produced an empty file.");
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, filePath);
      return {
        filename,
        size: fileStat.size,
        url: `/api/storage/download?folder=backups&filename=${filename}`,
      };
    } finally {
      await rm(temporaryPath, { force: true });
    }
  },

  async exportLogs() {
    const logDirectory = process.env["PM2_LOG_DIRECTORY"] || "/opt/ratingguard-worker-logs";
    const entries = await readdir(logDirectory, { withFileTypes: true });
    const logs = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".log"));
    const chunks: string[] = [];
    let remaining = MAX_LOG_BYTES;
    for (const entry of logs) {
      if (remaining <= 0) break;
      const path = join(logDirectory, entry.name);
      const fileStat = await stat(path);
      const length = Math.min(fileStat.size, remaining);
      if (length === 0) continue;
      const handle = await open(path, "r");
      try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, Math.max(0, fileStat.size - length));
        chunks.push(
          `--- ${basename(entry.name)} (last ${length} bytes) ---\n${buffer.toString("utf8")}`,
        );
        remaining -= length;
      } finally {
        await handle.close();
      }
    }
    const text = chunks
      .join("\n")
      .replace(
        /((?:api[_-]?key|secret|password|token|authorization)\s*[:=]\s*)[^\r\n]*/gi,
        "$1[REDACTED]",
      )
      .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]");
    const filename = `ratingguard-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    const saved = await this.upload("temp", filename, Buffer.from(text, "utf8"));
    return { filename, size: saved.size, url: saved.url };
  },
};
