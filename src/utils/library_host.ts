import type { ExportedLabelTemplate } from "$/types";
import type { LibraryFolder, LibraryIndex } from "$/utils/library_tree";
import { applyFolderMutation, emptyLibraryIndex, placeLabel } from "$/utils/library_tree";

export const PRESSMARK_HOST_PREFIX = "/__pressmark/host";
export const PRESSMARK_HOST_VERSION = 1;
export const LIBRARY_CHANGED_EVENT = "pressmark:library-changed";

export type LibraryMutation =
  | { type: "createFolder"; id?: string; name: string; parentId: string | null }
  | { type: "renameFolder"; id: string; name: string }
  | { type: "deleteFolder"; id: string }
  | { type: "moveFolder"; id: string; parentId: string | null }
  | { type: "moveLabel"; labelId: string; folderId: string | null }
  | { type: "upsertLabel"; label: ExportedLabelTemplate; folderId: string | null }
  | { type: "deleteLabel"; labelId: string };

export type LibrarySnapshot = {
  version: number;
  name: string;
  publishedAt: number;
  folders: LibraryFolder[];
  labels: ExportedLabelTemplate[];
  placements: LibraryIndex["placements"];
};

export type HostInfo = {
  ok: true;
  version: number;
  sharing: boolean;
  name?: string;
};

export const hostPath = (origin: string, path = ""): string =>
  `${origin.replace(/\/+$/, "")}${PRESSMARK_HOST_PREFIX}${path}`;

export const notifyLibraryChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
  }
};

export const snapshotFromLocal = (
  name: string,
  index: LibraryIndex,
  labels: ExportedLabelTemplate[],
): LibrarySnapshot => ({
  version: PRESSMARK_HOST_VERSION,
  name,
  publishedAt: Date.now(),
  folders: index.folders,
  labels,
  placements: index.placements,
});

export const applySnapshotMutation = (
  snapshot: LibrarySnapshot,
  mutation: LibraryMutation,
): LibrarySnapshot => {
  if (mutation.type === "upsertLabel") {
    const label = { ...mutation.label };
    const id = label.id;
    const labels = id
      ? [...snapshot.labels.filter((item) => item.id !== id), label]
      : [...snapshot.labels, label];
    const index = placeLabel(
      { folders: snapshot.folders, placements: snapshot.placements },
      id ?? "",
      mutation.folderId,
    );
    return { ...snapshot, labels, folders: index.folders, placements: index.placements, publishedAt: Date.now() };
  }
  if (mutation.type === "deleteLabel") {
    const placements = { ...snapshot.placements };
    delete placements[mutation.labelId];
    return {
      ...snapshot,
      labels: snapshot.labels.filter((label) => label.id !== mutation.labelId),
      placements,
      publishedAt: Date.now(),
    };
  }
  const index = applyFolderMutation(
    { folders: snapshot.folders, placements: snapshot.placements },
    mutation,
  );
  return { ...snapshot, folders: index.folders, placements: index.placements, publishedAt: Date.now() };
};

export const indexFromSnapshot = (snapshot: LibrarySnapshot): LibraryIndex => ({
  folders: snapshot.folders,
  placements: snapshot.placements,
});

export const emptySnapshot = (name = "Pressmark"): LibrarySnapshot => ({
  version: PRESSMARK_HOST_VERSION,
  name,
  publishedAt: Date.now(),
  folders: [],
  labels: [],
  placements: emptyLibraryIndex().placements,
});
