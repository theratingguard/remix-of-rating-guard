export const STORAGE_FOLDERS = ["reports", "backups", "temp"] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

export function validateStorageFolder(folder: string) {
  const parts = folder.split("/");
  if (
    parts.length < 1 ||
    parts.length > 3 ||
    !STORAGE_FOLDERS.includes(parts[0] as StorageFolder) ||
    parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(part) || part === "..")
  )
    throw new Error("Invalid storage folder.");
  return parts;
}

export function validateStorageFilename(filename: string) {
  if (
    filename.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) ||
    filename.endsWith(".tmp")
  )
    throw new Error("Invalid storage filename.");
  return filename;
}
