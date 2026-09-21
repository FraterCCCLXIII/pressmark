export type LibraryDragItem =
  | { kind: "label"; labelId: string; driveId: string }
  | { kind: "folder"; folderId: string; driveId: string };

const PREFIX = "pressmark:";

export const setLibraryDrag = (transfer: DataTransfer, item: LibraryDragItem) => {
  transfer.setData("text/plain", `${PREFIX}${JSON.stringify(item)}`);
  transfer.effectAllowed = item.kind === "label" ? "copyMove" : "move";
};

export const getLibraryDrag = (transfer: DataTransfer): LibraryDragItem | null => {
  const raw = transfer.getData("text/plain");
  if (!raw.startsWith(PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(PREFIX.length)) as LibraryDragItem;
  } catch {
    return null;
  }
};

export const isLibraryDrag = (transfer: DataTransfer): boolean =>
  [...transfer.types].includes("text/plain");
