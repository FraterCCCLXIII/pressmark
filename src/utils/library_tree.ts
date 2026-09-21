import { z } from "zod";

export const LOCAL_DRIVE_ID = "local";

export const LibraryFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  createdAt: z.number().positive(),
});

export const LibraryPlacementSchema = z.object({
  folderId: z.string().nullable(),
});

export const LibraryIndexSchema = z.object({
  folders: z.array(LibraryFolderSchema),
  placements: z.record(z.string(), LibraryPlacementSchema),
});

export const RemoteDriveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  origin: z.string().min(1),
  token: z.string().min(1),
});

export const LibraryShareSchema = z.object({
  enabled: z.boolean(),
  token: z.string().min(1),
  name: z.string().min(1),
});

export type LibraryFolder = z.infer<typeof LibraryFolderSchema>;
export type LibraryPlacement = z.infer<typeof LibraryPlacementSchema>;
export type LibraryIndex = z.infer<typeof LibraryIndexSchema>;
export type RemoteDrive = z.infer<typeof RemoteDriveSchema>;
export type LibraryShare = z.infer<typeof LibraryShareSchema>;

export const emptyLibraryIndex = (): LibraryIndex => ({
  folders: [],
  placements: {},
});

export const createFolderId = (): string =>
  `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createDriveId = (): string =>
  `drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, "");

const byName = (left: LibraryFolder, right: LibraryFolder) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: "base" });

export const childFolders = (folders: LibraryFolder[], parentId: string | null): LibraryFolder[] =>
  folders.filter((folder) => folder.parentId === parentId).sort(byName);

export const folderById = (folders: LibraryFolder[], id: string | null | undefined): LibraryFolder | undefined =>
  id ? folders.find((folder) => folder.id === id) : undefined;

export const folderAncestors = (folders: LibraryFolder[], folderId: string | null | undefined): LibraryFolder[] => {
  const chain: LibraryFolder[] = [];
  let current = folderById(folders, folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = folderById(folders, current.parentId);
  }
  return chain;
};

export const descendantFolderIds = (folders: LibraryFolder[], folderId: string): string[] => {
  const ids = [folderId];
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of folders.filter((folder) => folder.parentId === current)) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
};

export const wouldCreateCycle = (
  folders: LibraryFolder[],
  folderId: string,
  nextParentId: string | null,
): boolean => {
  if (nextParentId === folderId) {
    return true;
  }
  if (!nextParentId) {
    return false;
  }
  return descendantFolderIds(folders, folderId).includes(nextParentId);
};

export const labelFolderId = (index: LibraryIndex, labelId: string | undefined): string | null => {
  if (!labelId) {
    return null;
  }
  return index.placements[labelId]?.folderId ?? null;
};

export const labelsInFolder = <T extends { id?: string }>(
  labels: T[],
  index: LibraryIndex,
  folderId: string | null,
): T[] => labels.filter((label) => labelFolderId(index, label.id) === folderId);

export const createFolder = (index: LibraryIndex, name: string, parentId: string | null): LibraryIndex => {
  const trimmed = name.trim();
  if (!trimmed) {
    return index;
  }
  if (parentId && !folderById(index.folders, parentId)) {
    return index;
  }
  return {
    ...index,
    folders: [
      ...index.folders,
      {
        id: createFolderId(),
        name: trimmed,
        parentId,
        createdAt: Date.now(),
      },
    ],
  };
};

export const renameFolder = (index: LibraryIndex, folderId: string, name: string): LibraryIndex => {
  const trimmed = name.trim();
  if (!trimmed) {
    return index;
  }
  return {
    ...index,
    folders: index.folders.map((folder) => (folder.id === folderId ? { ...folder, name: trimmed } : folder)),
  };
};

export const moveFolder = (index: LibraryIndex, folderId: string, parentId: string | null): LibraryIndex => {
  if (!folderById(index.folders, folderId)) {
    return index;
  }
  if (parentId && !folderById(index.folders, parentId)) {
    return index;
  }
  if (wouldCreateCycle(index.folders, folderId, parentId)) {
    return index;
  }
  return {
    ...index,
    folders: index.folders.map((folder) => (folder.id === folderId ? { ...folder, parentId } : folder)),
  };
};

export const deleteFolder = (index: LibraryIndex, folderId: string): LibraryIndex => {
  const current = folderById(index.folders, folderId);
  if (!current) {
    return index;
  }
  const parentId = current.parentId;
  const nextFolders = index.folders
    .filter((folder) => folder.id !== folderId)
    .map((folder) => (folder.parentId === folderId ? { ...folder, parentId } : folder));
  const nextPlacements = { ...index.placements };
  for (const [labelId, placement] of Object.entries(nextPlacements)) {
    if (placement.folderId === folderId) {
      nextPlacements[labelId] = { folderId: parentId };
    }
  }
  return { folders: nextFolders, placements: nextPlacements };
};

export const placeLabel = (index: LibraryIndex, labelId: string, folderId: string | null): LibraryIndex => {
  if (!labelId) {
    return index;
  }
  if (folderId && !folderById(index.folders, folderId)) {
    return index;
  }
  return {
    ...index,
    placements: {
      ...index.placements,
      [labelId]: { folderId },
    },
  };
};

export const prunePlacements = (index: LibraryIndex, validLabelIds: Iterable<string>): LibraryIndex => {
  const allowed = new Set(validLabelIds);
  const placements = Object.fromEntries(
    Object.entries(index.placements).filter(([labelId]) => allowed.has(labelId)),
  );
  return { ...index, placements };
};

export const applyFolderMutation = (
  index: LibraryIndex,
  mutation:
    | { type: "createFolder"; id?: string; name: string; parentId: string | null }
    | { type: "renameFolder"; id: string; name: string }
    | { type: "deleteFolder"; id: string }
    | { type: "moveFolder"; id: string; parentId: string | null }
    | { type: "moveLabel"; labelId: string; folderId: string | null },
): LibraryIndex => {
  if (mutation.type === "createFolder") {
    const trimmed = mutation.name.trim();
    if (!trimmed) {
      return index;
    }
    if (mutation.parentId && !folderById(index.folders, mutation.parentId)) {
      return index;
    }
    if (mutation.id && folderById(index.folders, mutation.id)) {
      return index;
    }
    return {
      ...index,
      folders: [
        ...index.folders,
        {
          id: mutation.id ?? createFolderId(),
          name: trimmed,
          parentId: mutation.parentId,
          createdAt: Date.now(),
        },
      ],
    };
  }
  if (mutation.type === "renameFolder") {
    return renameFolder(index, mutation.id, mutation.name);
  }
  if (mutation.type === "deleteFolder") {
    return deleteFolder(index, mutation.id);
  }
  if (mutation.type === "moveFolder") {
    return moveFolder(index, mutation.id, mutation.parentId);
  }
  return placeLabel(index, mutation.labelId, mutation.folderId);
};
