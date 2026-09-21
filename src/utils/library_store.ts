import { LocalStoragePersistence } from "$/utils/persistence";
import {
  emptyLibraryIndex,
  LibraryIndexSchema,
  LibraryShareSchema,
  prunePlacements,
  RemoteDriveSchema,
  type LibraryIndex,
  type LibraryShare,
  type RemoteDrive,
} from "$/utils/library_tree";
import { z } from "zod";

const INDEX_KEY = "library_index";
const DRIVES_KEY = "library_drives";
const SHARE_KEY = "library_share";

const tokenAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateAccessCode = (length = 8): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => tokenAlphabet[byte % tokenAlphabet.length]).join("");
};

export const loadLibraryIndex = (): LibraryIndex => {
  try {
    return LocalStoragePersistence.loadAndValidateObject(INDEX_KEY, LibraryIndexSchema) ?? emptyLibraryIndex();
  } catch {
    return emptyLibraryIndex();
  }
};

export const saveLibraryIndex = (index: LibraryIndex) => {
  LocalStoragePersistence.validateAndSaveObject(INDEX_KEY, index, LibraryIndexSchema);
};

export const updateLibraryIndex = (updater: (index: LibraryIndex) => LibraryIndex): LibraryIndex => {
  const next = updater(loadLibraryIndex());
  saveLibraryIndex(next);
  return next;
};

export const syncLibraryPlacements = (labelIds: string[]): LibraryIndex => {
  const next = prunePlacements(loadLibraryIndex(), labelIds);
  saveLibraryIndex(next);
  return next;
};

export const loadRemoteDrives = (): RemoteDrive[] => {
  try {
    return LocalStoragePersistence.loadAndValidateObject(DRIVES_KEY, z.array(RemoteDriveSchema)) ?? [];
  } catch {
    return [];
  }
};

export const saveRemoteDrives = (drives: RemoteDrive[]) => {
  LocalStoragePersistence.validateAndSaveObject(DRIVES_KEY, drives, z.array(RemoteDriveSchema));
};

export const upsertRemoteDrive = (drive: RemoteDrive): RemoteDrive[] => {
  const next = [...loadRemoteDrives().filter((item) => item.id !== drive.id), drive];
  saveRemoteDrives(next);
  return next;
};

export const removeRemoteDrive = (driveId: string): RemoteDrive[] => {
  const next = loadRemoteDrives().filter((item) => item.id !== driveId);
  saveRemoteDrives(next);
  return next;
};

export const defaultShareName = (): string => {
  if (typeof window === "undefined") {
    return "Pressmark";
  }
  return window.location.hostname === "localhost" ? "This Pressmark" : "Pressmark library";
};

export const loadLibraryShare = (): LibraryShare => {
  try {
    return (
      LocalStoragePersistence.loadAndValidateObject(SHARE_KEY, LibraryShareSchema) ?? {
        enabled: false,
        token: generateAccessCode(),
        name: defaultShareName(),
      }
    );
  } catch {
    return { enabled: false, token: generateAccessCode(), name: defaultShareName() };
  }
};

export const saveLibraryShare = (share: LibraryShare) => {
  LocalStoragePersistence.validateAndSaveObject(SHARE_KEY, share, LibraryShareSchema);
};
