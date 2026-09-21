<script lang="ts">
  import type { ExportedLabelTemplate, PrintHistoryEntry } from "$/types";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { getStarterTemplates, isStarterTemplate } from "$/utils/starter_templates";
  import { formatLabelSize } from "$/utils/label_geometry";
  import { cloneLabelTemplate } from "$/utils/label_template";
  import { FileUtils } from "$/utils/file_utils";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button } from "$/components/ui";
  import TemplateCard from "$/components/workspace/TemplateCard.svelte";
  import RenameLabelDialog from "$/components/workspace/RenameLabelDialog.svelte";
  import AddRemoteDriveDialog from "$/components/workspace/AddRemoteDriveDialog.svelte";
  import FolderNav from "$/components/workspace/FolderNav.svelte";
  import CustomScroll from "$/components/basic/CustomScroll.svelte";
  import { libraryHref, type LibraryLocation } from "$/utils/app_router";
  import { LIBRARY_CHANGED_EVENT, indexFromSnapshot, type LibrarySnapshot } from "$/utils/library_host";
  import { fetchRemoteLibrary, mutateRemoteLibrary } from "$/utils/library_remote";
  import { getLibraryDrag, isLibraryDrag, setLibraryDrag, type LibraryDragItem } from "$/utils/library_dnd";
  import {
    loadLibraryIndex,
    loadRemoteDrives,
    removeRemoteDrive,
    saveLibraryIndex,
    syncLibraryPlacements,
    upsertRemoteDrive,
  } from "$/utils/library_store";
  import {
    applyFolderMutation,
    childFolders,
    createFolderId,
    folderAncestors,
    folderById,
    labelsInFolder,
    LOCAL_DRIVE_ID,
    type LibraryFolder,
    type LibraryIndex,
    type RemoteDrive,
  } from "$/utils/library_tree";
  import { onMount, untrack } from "svelte";

  interface Props {
    location: LibraryLocation;
    revision: number;
    onNavigate: (location: LibraryLocation) => void;
    onCreate: () => void;
    openTemplate: (label: ExportedLabelTemplate, options?: { print?: boolean }) => void;
    onLabelRenamed?: (id: string, title: string) => void;
  }

  let { location, revision, onNavigate, onCreate, openTemplate, onLabelRenamed }: Props = $props();

  let savedLabels = $state.raw<ExportedLabelTemplate[]>([]);
  let history = $state.raw<PrintHistoryEntry[]>([]);
  let printCounts = $state<Record<string, number>>({});
  let index = $state.raw<LibraryIndex>(loadLibraryIndex());
  let drives = $state.raw<RemoteDrive[]>(loadRemoteDrives());
  let remoteSnapshots = $state<Record<string, LibrarySnapshot>>({});
  let driveStatus = $state<Record<string, "idle" | "loading" | "ok" | "error">>({});
  let starters = getStarterTemplates();
  let renameOpen = $state(false);
  let renaming = $state<ExportedLabelTemplate | undefined>(undefined);
  let folderPrompt = $state<"create" | "rename" | null>(null);
  let folderPromptOpen = $state(false);
  let folderTarget = $state<{ driveId: string; folder?: LibraryFolder; parentId: string | null } | null>(null);
  let driveDialog = $state(false);
  let dropGrid = $state(false);

  const section = $derived(location.section);

  const refreshLocal = () => {
    const labels = LocalStoragePersistence.loadLabels();
    savedLabels = labels;
    history = LocalStoragePersistence.loadPrintHistory();
    printCounts = LocalStoragePersistence.loadPrintCounts();
    index = syncLibraryPlacements(labels.map((label) => label.id).filter((id): id is string => !!id));
    drives = loadRemoteDrives();
  };

  const refreshDrive = async (driveId: string) => {
    const drive = drives.find((item) => item.id === driveId);
    if (!drive) {
      return;
    }
    driveStatus = { ...driveStatus, [driveId]: "loading" };
    try {
      remoteSnapshots = { ...remoteSnapshots, [driveId]: await fetchRemoteLibrary(drive.origin, drive.token) };
      driveStatus = { ...driveStatus, [driveId]: "ok" };
    } catch {
      driveStatus = { ...driveStatus, [driveId]: "error" };
    }
  };

  $effect(() => {
    void revision;
    untrack(refreshLocal);
  });

  $effect(() => {
    if (location.section === "drive" && location.driveId) {
      const id = location.driveId;
      untrack(() => {
        void refreshDrive(id);
      });
    }
  });

  onMount(() => {
    drives.forEach((drive) => void refreshDrive(drive.id));
    const onChanged = () => refreshLocal();
    const timer = window.setInterval(() => {
      loadRemoteDrives().forEach((drive) => void refreshDrive(drive.id));
    }, 4000);
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged);
    };
  });

  const currentDriveId = $derived(section === "drive" ? (location.driveId ?? "") : LOCAL_DRIVE_ID);
  const currentIndex = $derived(
    currentDriveId === LOCAL_DRIVE_ID ? index : indexFromSnapshot(remoteSnapshots[currentDriveId] ?? { folders: [], placements: {}, labels: [], name: "", publishedAt: 0, version: 1 }),
  );
  const currentLabels = $derived(currentDriveId === LOCAL_DRIVE_ID ? savedLabels : (remoteSnapshots[currentDriveId]?.labels ?? []));
  const currentFolderId = $derived(location.folderId ?? null);
  const currentFolder = $derived(folderById(currentIndex.folders, currentFolderId));
  const currentChildren = $derived(
    section === "mine" || section === "drive" ? childFolders(currentIndex.folders, currentFolderId) : [],
  );
  const breadcrumb = $derived(folderAncestors(currentIndex.folders, currentFolderId));

  const recentLabels = $derived.by(() => {
    const recentIds = LocalStoragePersistence.loadRecentLabels().map((item) => item.id);
    const byId = new Map(savedLabels.map((label) => [label.id, label]));
    const ordered = recentIds.map((id) => byId.get(id)).filter((label): label is ExportedLabelTemplate => !!label);
    if (ordered.length > 0) {
      return ordered;
    }
    return [...savedLabels].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  });

  const visibleLabels = $derived.by(() => {
    if (section === "catalog") {
      return starters;
    }
    if (section === "recent") {
      return recentLabels;
    }
    return labelsInFolder(currentLabels, currentIndex, currentFolderId);
  });

  const heading = $derived(
    section === "history"
      ? $tr("library.print_history")
      : section === "catalog"
        ? $tr("library.catalog")
        : section === "recent"
          ? $tr("library.recent")
          : currentFolder?.name ??
            (section === "drive"
              ? (drives.find((drive) => drive.id === location.driveId)?.name ?? $tr("library.drive.default_name"))
              : $tr("library.my_templates")),
  );

  const emptyText = $derived(
    section === "history"
      ? $tr("library.empty.history")
      : section === "catalog"
        ? $tr("library.empty.catalog")
        : section === "recent"
          ? $tr("library.empty.recent")
          : $tr("library.empty.folder"),
  );

  const persistLocal = (next: LibraryIndex) => {
    saveLibraryIndex(next);
    index = next;
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
  };

  const selectLabel = (label: ExportedLabelTemplate, options?: { print?: boolean }) => {
    const cloned = cloneLabelTemplate(label);
    if (currentDriveId !== LOCAL_DRIVE_ID) {
      cloned.id = undefined;
    }
    openTemplate(cloned, options);
  };

  const exportLabel = (label: ExportedLabelTemplate) => {
    FileUtils.saveLabelAsJson(cloneLabelTemplate(label));
  };

  const canDeleteLabel = (label: ExportedLabelTemplate) => !!label.id && !isStarterTemplate(label.id) && currentDriveId === LOCAL_DRIVE_ID;
  const canRenameLabel = (label: ExportedLabelTemplate) => canDeleteLabel(label);

  const openRename = (label: ExportedLabelTemplate) => {
    if (!canRenameLabel(label)) {
      return;
    }
    renaming = label;
    renameOpen = true;
  };

  const applyRename = (title: string) => {
    const current = renaming;
    const id = current?.id;
    if (!current || !id || !canRenameLabel(current)) {
      return;
    }
    if (!LocalStoragePersistence.renameLabel(id, title)) {
      return;
    }
    onLabelRenamed?.(id, title);
    refreshLocal();
  };

  const duplicateLabel = (label: ExportedLabelTemplate) => {
    const cloned = cloneLabelTemplate(label);
    cloned.id = undefined;
    cloned.timestamp = FileUtils.timestamp();
    cloned.title = `${cloned.title || $tr("editor.untitled")} copy`;
    const next = [...LocalStoragePersistence.loadLabels(), cloned];
    LocalStoragePersistence.saveLabels(next);
    const created = LocalStoragePersistence.loadLabels().find((item) => item.timestamp === cloned.timestamp && item.title === cloned.title);
    if (created?.id && (section === "mine" || section === "drive") && currentDriveId === LOCAL_DRIVE_ID) {
      persistLocal(applyFolderMutation(loadLibraryIndex(), { type: "moveLabel", labelId: created.id, folderId: currentFolderId }));
    }
    refreshLocal();
  };

  const deleteLabel = (label: ExportedLabelTemplate) => {
    if (!canDeleteLabel(label)) {
      return;
    }
    LocalStoragePersistence.saveLabels(savedLabels.filter((item) => item.id !== label.id));
    refreshLocal();
  };

  const openHistory = (entry: PrintHistoryEntry) => {
    if (!entry.sourceId) {
      return;
    }
    const match = savedLabels.find((label) => label.id === entry.sourceId);
    if (match) {
      selectLabel(match);
    }
  };

  const openFolderPrompt = (mode: "create" | "rename", driveId: string, parentId: string | null, folder?: LibraryFolder) => {
    folderTarget = { driveId, parentId, folder };
    folderPrompt = mode;
    folderPromptOpen = true;
  };

  const applyFolderName = async (name: string) => {
    const target = folderTarget;
    const mode = folderPrompt;
    folderPrompt = null;
    folderPromptOpen = false;
    if (!target || !mode) {
      return;
    }
    const mutation =
      mode === "rename" && target.folder
        ? { type: "renameFolder" as const, id: target.folder.id, name }
        : { type: "createFolder" as const, id: createFolderId(), name, parentId: target.parentId };
    if (target.driveId === LOCAL_DRIVE_ID) {
      persistLocal(applyFolderMutation(loadLibraryIndex(), mutation));
      refreshLocal();
      return;
    }
    const drive = drives.find((item) => item.id === target.driveId);
    if (!drive) {
      return;
    }
    remoteSnapshots = { ...remoteSnapshots, [drive.id]: await mutateRemoteLibrary(drive.origin, drive.token, mutation) };
  };

  const deleteFolder = async (folder: LibraryFolder, driveId: string) => {
    const mutation = { type: "deleteFolder" as const, id: folder.id };
    if (driveId === LOCAL_DRIVE_ID) {
      persistLocal(applyFolderMutation(loadLibraryIndex(), mutation));
      if (location.folderId === folder.id) {
        onNavigate({ section: "mine", folderId: folder.parentId ?? undefined });
      }
      refreshLocal();
      return;
    }
    const drive = drives.find((item) => item.id === driveId);
    if (!drive) {
      return;
    }
    remoteSnapshots = { ...remoteSnapshots, [drive.id]: await mutateRemoteLibrary(drive.origin, drive.token, mutation) };
    if (location.driveId === driveId && location.folderId === folder.id) {
      onNavigate({ section: "drive", driveId, folderId: folder.parentId ?? undefined });
    }
  };

  const importLabelToLocal = (label: ExportedLabelTemplate, folderId: string | null) => {
    const cloned = cloneLabelTemplate(label);
    cloned.id = undefined;
    cloned.timestamp = FileUtils.timestamp();
    LocalStoragePersistence.saveLabels([...LocalStoragePersistence.loadLabels(), cloned]);
    const created = LocalStoragePersistence.loadLabels().find((item) => item.timestamp === cloned.timestamp);
    if (created?.id) {
      persistLocal(applyFolderMutation(loadLibraryIndex(), { type: "moveLabel", labelId: created.id, folderId }));
    }
    refreshLocal();
  };

  const onDropItem = async (item: LibraryDragItem, target: { driveId: string; folderId: string | null }) => {
    if (item.kind === "folder") {
      if (item.driveId !== target.driveId) {
        return;
      }
      const mutation = { type: "moveFolder" as const, id: item.folderId, parentId: target.folderId };
      if (target.driveId === LOCAL_DRIVE_ID) {
        persistLocal(applyFolderMutation(loadLibraryIndex(), mutation));
        refreshLocal();
        return;
      }
      const drive = drives.find((entry) => entry.id === target.driveId);
      if (drive) {
        remoteSnapshots = { ...remoteSnapshots, [drive.id]: await mutateRemoteLibrary(drive.origin, drive.token, mutation) };
      }
      return;
    }

    if (item.driveId === target.driveId) {
      const mutation = { type: "moveLabel" as const, labelId: item.labelId, folderId: target.folderId };
      if (target.driveId === LOCAL_DRIVE_ID) {
        persistLocal(applyFolderMutation(loadLibraryIndex(), mutation));
        refreshLocal();
        return;
      }
      const drive = drives.find((entry) => entry.id === target.driveId);
      if (drive) {
        remoteSnapshots = { ...remoteSnapshots, [drive.id]: await mutateRemoteLibrary(drive.origin, drive.token, mutation) };
      }
      return;
    }

    if (item.driveId === LOCAL_DRIVE_ID && target.driveId !== LOCAL_DRIVE_ID) {
      const label = savedLabels.find((entry) => entry.id === item.labelId);
      const drive = drives.find((entry) => entry.id === target.driveId);
      if (!label || !drive) {
        return;
      }
      remoteSnapshots = {
        ...remoteSnapshots,
        [drive.id]: await mutateRemoteLibrary(drive.origin, drive.token, {
          type: "upsertLabel",
          label,
          folderId: target.folderId,
        }),
      };
      return;
    }

    if (item.driveId !== LOCAL_DRIVE_ID && target.driveId === LOCAL_DRIVE_ID) {
      const label = remoteSnapshots[item.driveId]?.labels.find((entry) => entry.id === item.labelId);
      if (label) {
        importLabelToLocal(label, target.folderId);
      }
    }
  };

  const onCardDragStart = (event: DragEvent, label: ExportedLabelTemplate) => {
    if (!event.dataTransfer || !label.id || isStarterTemplate(label.id) || section === "catalog" || section === "recent") {
      return;
    }
    setLibraryDrag(event.dataTransfer, { kind: "label", labelId: label.id, driveId: currentDriveId });
  };

  const remoteFolders = $derived(
    Object.fromEntries(drives.map((drive) => [drive.id, remoteSnapshots[drive.id]?.folders ?? []])),
  );
</script>

<div class="library">
  <aside class="library-nav">
    <Button variant="primary" class="mb-3" onclick={onCreate}>
      <MdIcon icon="add" />
      {$tr("library.create")}
    </Button>
    <a class="library-nav__item" class:is-active={section === "recent"} href={libraryHref("recent")}>
      <MdIcon icon="schedule" />
      {$tr("library.recent")}
    </a>
    <a class="library-nav__item" class:is-active={section === "history"} href={libraryHref("history")}>
      <MdIcon icon="history" />
      {$tr("library.print_history")}
    </a>
    <a class="library-nav__item" class:is-active={section === "catalog"} href={libraryHref("catalog")}>
      <MdIcon icon="widgets" />
      {$tr("library.catalog")}
    </a>

    <FolderNav
      {location}
      folders={index.folders}
      {drives}
      {remoteFolders}
      {driveStatus}
      onNewFolder={(parentId, driveId) => openFolderPrompt("create", driveId, parentId)}
      onRenameFolder={(folder, driveId) => openFolderPrompt("rename", driveId, folder.parentId, folder)}
      onDeleteFolder={deleteFolder}
      {onDropItem}
      onAddDrive={() => (driveDialog = true)}
      onRefreshDrive={(driveId) => void refreshDrive(driveId)}
      onRemoveDrive={(driveId) => {
        drives = removeRemoteDrive(driveId);
        const next = { ...remoteSnapshots };
        delete next[driveId];
        remoteSnapshots = next;
        if (location.driveId === driveId) {
          onNavigate({ section: "mine" });
        }
      }} />
  </aside>

  <CustomScroll class="library-main">
    {#if (section === "mine" || section === "drive") && breadcrumb.length}
      <nav class="library-crumb">
        <a href={section === "drive" ? libraryHref("drive", { driveId: location.driveId }) : libraryHref("mine")}>
          {section === "drive"
            ? (drives.find((drive) => drive.id === location.driveId)?.name ?? $tr("library.drive.default_name"))
            : $tr("library.my_templates")}
        </a>
        {#each breadcrumb as folder (folder.id)}
          <MdIcon icon="chevron_right" />
          <a href={section === "drive" ? libraryHref("drive", { driveId: location.driveId, folderId: folder.id }) : libraryHref("mine", { folderId: folder.id })}>
            {folder.name}
          </a>
        {/each}
      </nav>
    {/if}
    <h2>{heading}</h2>

    {#if section === "history"}
      {#if history.length === 0}
        <div class="library-empty">{emptyText}</div>
      {:else}
        <div class="template-grid">
          {#each history as entry (entry.id)}
            <button type="button" class="template-card" onclick={() => openHistory(entry)}>
              <div class="template-card__preview">
                {#if entry.thumbnailBase64}
                  <img src={entry.thumbnailBase64} alt="" />
                {/if}
              </div>
              <div class="template-card__meta">
                <div>
                  <div class="template-card__title">{entry.title}</div>
                  <div class="template-card__size">
                    {formatLabelSize({ printDirection: "left", size: entry.size })}
                  </div>
                </div>
                <div class="template-card__prints">
                  {entry.copies}
                  {$tr("library.copies")}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div
        class="template-grid"
        class:is-drop={dropGrid}
        role="list"
        ondragover={(event) => {
          if (event.dataTransfer && isLibraryDrag(event.dataTransfer) && (section === "mine" || section === "drive")) {
            event.preventDefault();
            dropGrid = true;
          }
        }}
        ondragleave={() => (dropGrid = false)}
        ondrop={(event) => {
          dropGrid = false;
          if (!event.dataTransfer || (section !== "mine" && section !== "drive")) {
            return;
          }
          event.preventDefault();
          const item = getLibraryDrag(event.dataTransfer);
          if (item) {
            void onDropItem(item, { driveId: currentDriveId, folderId: currentFolderId });
          }
        }}>
        {#each currentChildren as folder (folder.id)}
          <a
            class="folder-tile"
            href={currentDriveId === LOCAL_DRIVE_ID
              ? libraryHref("mine", { folderId: folder.id })
              : libraryHref("drive", { driveId: currentDriveId, folderId: folder.id })}
            draggable="true"
            ondragstart={(event) => event.dataTransfer && setLibraryDrag(event.dataTransfer, { kind: "folder", folderId: folder.id, driveId: currentDriveId })}
            ondragover={(event) => {
              if (event.dataTransfer && isLibraryDrag(event.dataTransfer)) {
                event.preventDefault();
              }
            }}
            ondrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!event.dataTransfer) {
                return;
              }
              const item = getLibraryDrag(event.dataTransfer);
              if (item) {
                void onDropItem(item, { driveId: currentDriveId, folderId: folder.id });
              }
            }}>
            <MdIcon icon="folder" />
            <span>{folder.name}</span>
          </a>
        {/each}

        {#if visibleLabels.length === 0 && currentChildren.length === 0 && section === "recent"}
          {#each starters as label (label.id)}
            <TemplateCard
              {label}
              onSelect={() => selectLabel(label)}
              onDuplicate={() => duplicateLabel(label)}
              onExport={() => exportLabel(label)}
              onPrint={() => selectLabel(label, { print: true })} />
          {/each}
        {:else if visibleLabels.length === 0 && currentChildren.length === 0}
          <div class="library-empty">{emptyText}</div>
        {:else}
          {#each visibleLabels as label, cardIndex (label.id ?? `${label.title}-${cardIndex}`)}
            <TemplateCard
              {label}
              printCount={label.id ? printCounts[label.id] ?? 0 : 0}
              draggable={!!label.id && !isStarterTemplate(label.id) && (section === "mine" || section === "drive")}
              onDragStart={(event) => onCardDragStart(event, label)}
              onSelect={() => selectLabel(label)}
              onRename={canRenameLabel(label) ? () => openRename(label) : undefined}
              onDuplicate={() => duplicateLabel(label)}
              onDelete={canDeleteLabel(label) ? () => deleteLabel(label) : undefined}
              onExport={() => exportLabel(label)}
              onPrint={() => selectLabel(label, { print: true })} />
          {/each}
        {/if}
      </div>
    {/if}
  </CustomScroll>

  <RenameLabelDialog
    bind:show={renameOpen}
    value={renaming?.title?.trim() || $tr("editor.untitled")}
    onRename={applyRename} />
  <RenameLabelDialog
    bind:show={folderPromptOpen}
    title={folderPrompt === "rename" ? $tr("library.folder.rename") : $tr("library.folder.new")}
    fieldLabel={$tr("library.folder.name")}
    actionLabel={folderPrompt === "rename" ? $tr("library.rename") : $tr("library.folder.create")}
    value={folderTarget?.folder?.name ?? ""}
    onRename={(name) => void applyFolderName(name)} />
  <AddRemoteDriveDialog
    bind:show={driveDialog}
    onAdd={(drive) => {
      drives = upsertRemoteDrive(drive);
      void refreshDrive(drive.id);
      onNavigate({ section: "drive", driveId: drive.id });
    }} />
</div>
