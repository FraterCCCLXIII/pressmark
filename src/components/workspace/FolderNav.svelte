<script lang="ts">
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { IconButton, Menu, MenuItem } from "$/components/ui";
  import { getLibraryDrag, isLibraryDrag, setLibraryDrag, type LibraryDragItem } from "$/utils/library_dnd";
  import { childFolders, LOCAL_DRIVE_ID, type LibraryFolder, type RemoteDrive } from "$/utils/library_tree";
  import { libraryHref, type LibraryLocation } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  interface Props {
    location: LibraryLocation;
    folders: LibraryFolder[];
    drives: RemoteDrive[];
    remoteFolders: Record<string, LibraryFolder[]>;
    driveStatus: Record<string, "idle" | "loading" | "ok" | "error">;
    onNewFolder: (parentId: string | null, driveId: string) => void;
    onRenameFolder: (folder: LibraryFolder, driveId: string) => void;
    onDeleteFolder: (folder: LibraryFolder, driveId: string) => void;
    onDropItem: (item: LibraryDragItem, target: { driveId: string; folderId: string | null }) => void;
    onAddDrive: () => void;
    onRefreshDrive: (driveId: string) => void;
    onRemoveDrive: (driveId: string) => void;
  }

  let {
    location,
    folders,
    drives,
    remoteFolders,
    driveStatus,
    onNewFolder,
    onRenameFolder,
    onDeleteFolder,
    onDropItem,
    onAddDrive,
    onRefreshDrive,
    onRemoveDrive,
  }: Props = $props();

  let expanded = $state<Record<string, boolean>>({ [LOCAL_DRIVE_ID]: true });
  let dropKey = $state<string | null>(null);

  const isOpen = (key: string) => expanded[key] !== false;

  const toggle = (key: string) => {
    expanded = { ...expanded, [key]: !isOpen(key) };
  };

  const targetKey = (driveId: string, folderId: string | null) => `${driveId}:${folderId ?? "root"}`;

  const isActive = (driveId: string, folderId: string | null) => {
    if (driveId === LOCAL_DRIVE_ID) {
      return location.section === "mine" && (location.folderId ?? "") === (folderId ?? "");
    }
    return location.section === "drive" && location.driveId === driveId && (location.folderId ?? "") === (folderId ?? "");
  };

  const hrefFor = (driveId: string, folderId: string | null) =>
    driveId === LOCAL_DRIVE_ID
      ? libraryHref("mine", { folderId: folderId ?? undefined })
      : libraryHref("drive", { driveId, folderId: folderId ?? undefined });

  const onDragOver = (event: DragEvent, key: string) => {
    if (!event.dataTransfer || !isLibraryDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dropKey = key;
  };

  const onDrop = (event: DragEvent, driveId: string, folderId: string | null) => {
    event.preventDefault();
    dropKey = null;
    if (!event.dataTransfer) {
      return;
    }
    const item = getLibraryDrag(event.dataTransfer);
    if (item) {
      onDropItem(item, { driveId, folderId });
    }
  };

  const startFolderDrag = (event: DragEvent, folderId: string, driveId: string) => {
    if (!event.dataTransfer) {
      return;
    }
    setLibraryDrag(event.dataTransfer, { kind: "folder", folderId, driveId });
  };
</script>

{#snippet folderMenu(folder: LibraryFolder, driveId: string)}
  <Menu align="start">
    {#snippet trigger({ toggle: openMenu })}
      <button
        type="button"
        class="folder-tree__more"
        title={$tr("editor.more")}
        aria-label={$tr("editor.more")}
        onclick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openMenu();
        }}>
        <MdIcon icon="more_horiz" />
      </button>
    {/snippet}
    <MenuItem onclick={() => onNewFolder(folder.id, driveId)}>{$tr("library.folder.new_sub")}</MenuItem>
    <MenuItem onclick={() => onRenameFolder(folder, driveId)}>{$tr("library.rename")}</MenuItem>
    <MenuItem danger onclick={() => onDeleteFolder(folder, driveId)}>{$tr("library.delete")}</MenuItem>
  </Menu>
{/snippet}

{#snippet treeRows(driveId: string, parentId: string | null, depth: number)}
  {@const rows = childFolders(driveId === LOCAL_DRIVE_ID ? folders : (remoteFolders[driveId] ?? []), parentId)}
  {#each rows as folder (folder.id)}
    {@const key = targetKey(driveId, folder.id)}
    {@const kids = childFolders(driveId === LOCAL_DRIVE_ID ? folders : (remoteFolders[driveId] ?? []), folder.id)}
    <div
      class="folder-tree__row-wrap"
      style={`padding-left: ${12 + depth * 14}px`}
      role="listitem"
      draggable="true"
      ondragstart={(event) => startFolderDrag(event, folder.id, driveId)}
      ondragover={(event) => onDragOver(event, key)}
      ondragleave={() => {
        if (dropKey === key) dropKey = null;
      }}
      ondrop={(event) => onDrop(event, driveId, folder.id)}>
      <div class="folder-tree__row" class:is-active={isActive(driveId, folder.id)} class:is-drop={dropKey === key}>
        <button
          type="button"
          class="folder-tree__twist"
          class:is-leaf={kids.length === 0}
          aria-label={isOpen(key) ? $tr("library.folder.collapse") : $tr("library.folder.expand")}
          onclick={() => {
            if (kids.length) toggle(key);
          }}>
          {#if kids.length}
            <MdIcon icon={isOpen(key) ? "expand_more" : "chevron_right"} />
          {/if}
        </button>
        <a class="folder-tree__link" href={hrefFor(driveId, folder.id)}>
          <MdIcon icon={isOpen(key) && kids.length ? "folder_open" : "folder"} />
          <span class="folder-tree__name">{folder.name}</span>
        </a>
        {@render folderMenu(folder, driveId)}
      </div>
    </div>
    {#if kids.length && isOpen(key)}
      {@render treeRows(driveId, folder.id, depth + 1)}
    {/if}
  {/each}
{/snippet}

<div class="folder-tree" role="list">
  <div class="folder-tree__heading">
    <span>{$tr("library.folders")}</span>
    <IconButton class="size-7" title={$tr("library.folder.new")} aria-label={$tr("library.folder.new")} onclick={() => onNewFolder(null, LOCAL_DRIVE_ID)}>
      <MdIcon icon="create_new_folder" />
    </IconButton>
  </div>

  <div
    class="folder-tree__row folder-tree__root"
    class:is-active={isActive(LOCAL_DRIVE_ID, null)}
    class:is-drop={dropKey === targetKey(LOCAL_DRIVE_ID, null)}
    role="listitem"
    ondragover={(event) => onDragOver(event, targetKey(LOCAL_DRIVE_ID, null))}
    ondragleave={() => {
      if (dropKey === targetKey(LOCAL_DRIVE_ID, null)) dropKey = null;
    }}
    ondrop={(event) => onDrop(event, LOCAL_DRIVE_ID, null)}>
    <span class="folder-tree__twist">
      <MdIcon icon="expand_more" />
    </span>
    <a class="folder-tree__link" href={hrefFor(LOCAL_DRIVE_ID, null)}>
      <MdIcon icon="folder_special" />
      <span class="folder-tree__name">{$tr("library.my_templates")}</span>
    </a>
  </div>
  {@render treeRows(LOCAL_DRIVE_ID, null, 0)}

  {#each drives as drive (drive.id)}
    {@const rootKey = targetKey(drive.id, null)}
    <div class="folder-tree__drive" role="list">
      <div
        class="folder-tree__row folder-tree__root"
        class:is-active={isActive(drive.id, null)}
        class:is-drop={dropKey === rootKey}
        role="listitem"
        ondragover={(event) => onDragOver(event, rootKey)}
        ondragleave={() => {
          if (dropKey === rootKey) dropKey = null;
        }}
        ondrop={(event) => onDrop(event, drive.id, null)}>
        <button
          type="button"
          class="folder-tree__twist"
          onclick={() => toggle(drive.id)}>
          <MdIcon icon={isOpen(drive.id) ? "expand_more" : "chevron_right"} />
        </button>
        <a class="folder-tree__link" href={hrefFor(drive.id, null)}>
          <MdIcon icon="cloud" />
          <span class="folder-tree__name">{drive.name}</span>
        </a>
        <Menu align="start">
          {#snippet trigger({ toggle: openMenu })}
            <button
              type="button"
              class="folder-tree__more"
              title={$tr("editor.more")}
              onclick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openMenu();
              }}>
              <MdIcon icon="more_horiz" />
            </button>
          {/snippet}
          <MenuItem onclick={() => onNewFolder(null, drive.id)}>{$tr("library.folder.new")}</MenuItem>
          <MenuItem onclick={() => onRefreshDrive(drive.id)}>{$tr("library.drive.refresh")}</MenuItem>
          <MenuItem danger onclick={() => onRemoveDrive(drive.id)}>{$tr("library.drive.remove")}</MenuItem>
        </Menu>
      </div>
      {#if driveStatus[drive.id] === "error"}
        <div class="folder-tree__status">{$tr("library.drive.offline")}</div>
      {/if}
      {#if isOpen(drive.id)}
        {@render treeRows(drive.id, null, 0)}
      {/if}
    </div>
  {/each}

  <button type="button" class="folder-tree__add-drive" onclick={onAddDrive}>
    <MdIcon icon="add" />
    {$tr("library.drive.add")}
  </button>
</div>
