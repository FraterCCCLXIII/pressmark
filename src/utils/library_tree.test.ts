import assert from "node:assert/strict";
import {
  applyFolderMutation,
  childFolders,
  createFolder,
  deleteFolder,
  descendantFolderIds,
  emptyLibraryIndex,
  folderAncestors,
  labelsInFolder,
  moveFolder,
  placeLabel,
  prunePlacements,
  renameFolder,
  wouldCreateCycle,
} from "./library_tree";

const run = () => {
  let index = emptyLibraryIndex();
  index = createFolder(index, "Work", null);
  index = createFolder(index, "Home", null);
  const work = childFolders(index.folders, null).find((folder) => folder.name === "Work");
  const home = childFolders(index.folders, null).find((folder) => folder.name === "Home");
  assert.ok(work && home);

  index = applyFolderMutation(index, { type: "createFolder", name: "Shipping", parentId: work.id });
  const shipping = childFolders(index.folders, work.id)[0];
  assert.equal(shipping?.name, "Shipping");
  assert.deepEqual(
    folderAncestors(index.folders, shipping.id).map((folder) => folder.name),
    ["Work", "Shipping"],
  );

  index = placeLabel(index, "saved_label_1", shipping.id);
  index = placeLabel(index, "saved_label_2", null);
  assert.equal(labelsInFolder([{ id: "saved_label_1" }, { id: "saved_label_2" }], index, shipping.id).length, 1);
  assert.equal(labelsInFolder([{ id: "saved_label_1" }, { id: "saved_label_2" }], index, null).length, 1);

  assert.equal(wouldCreateCycle(index.folders, work.id, shipping.id), true);
  const blocked = moveFolder(index, work.id, shipping.id);
  assert.equal(blocked.folders.find((folder) => folder.id === work.id)?.parentId, null);

  index = moveFolder(index, shipping.id, home.id);
  assert.equal(index.folders.find((folder) => folder.id === shipping.id)?.parentId, home.id);
  assert.ok(descendantFolderIds(index.folders, home.id).includes(shipping.id));

  index = renameFolder(index, home.id, "Personal");
  assert.equal(index.folders.find((folder) => folder.id === home.id)?.name, "Personal");

  index = deleteFolder(index, home.id);
  assert.equal(index.folders.some((folder) => folder.id === home.id), false);
  assert.equal(index.folders.find((folder) => folder.id === shipping.id)?.parentId, null);
  assert.equal(index.placements["saved_label_1"]?.folderId, shipping.id);

  index = prunePlacements(index, ["saved_label_2"]);
  assert.equal(index.placements["saved_label_1"], undefined);
  assert.ok(index.placements["saved_label_2"]);

  console.log("library_tree tests passed");
};

run();
