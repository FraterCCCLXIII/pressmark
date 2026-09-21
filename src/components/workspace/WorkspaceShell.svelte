<script lang="ts">
  import { onMount, tick } from "svelte";
  import LabelDesigner from "$/components/LabelDesigner.svelte";
  import TemplateLibrary from "$/components/workspace/TemplateLibrary.svelte";
  import {
    type AppRoute,
    type LibraryLocation,
    isShareHash,
    navigateApp,
    parseAppRoute,
    settingsHref,
    subscribeAppRoute,
  } from "$/utils/app_router";
  import CreateLabelDialog from "$/components/workspace/CreateLabelDialog.svelte";
  import WorkspaceTabBar from "$/components/workspace/WorkspaceTabBar.svelte";
  import PrinterConnector from "$/components/PrinterConnector.svelte";
  import SettingsDialog from "$/components/workspace/SettingsDialog.svelte";
  import SavedLabelsDialog from "$/components/workspace/SavedLabelsDialog.svelte";
  import BrowserWarning from "$/components/basic/BrowserWarning.svelte";
  import DebugStuff from "$/components/DebugStuff.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { IconButton } from "$/components/ui";
  import { automation } from "$/stores";
  import type { ExportedLabelTemplate, LabelProps, WorkspaceTabState } from "$/types";
  import { emptyLabelTemplate } from "$/utils/starter_templates";
  import { isStarterTemplate } from "$/utils/starter_templates";
  import { FileUtils } from "$/utils/file_utils";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { cloneLabelTemplate } from "$/utils/label_template";
  import { tr } from "$/utils/i18n";
  import { getDesktop } from "$/utils/desktop";
  import { Toasts } from "$/utils/toasts";
  import { LIBRARY_CHANGED_EVENT } from "$/utils/library_host";
  import { startLibraryShareRuntime } from "$/utils/library_share";

  // eslint-disable-next-line no-undef
  const appCommit = __APP_COMMIT__;
  // eslint-disable-next-line no-undef
  const buildDate = __BUILD_DATE__;

  const restoredSession = LocalStoragePersistence.loadWorkspaceSession();
  const bootRoute = parseAppRoute();

  let view = $state<"library" | "editor">(
    bootRoute?.name === "editor" ? "editor" : bootRoute?.name === "library" ? "library" : (restoredSession?.view ?? "library"),
  );
  let section = $state<LibraryLocation["section"]>(bootRoute?.name === "library" ? bootRoute.section : (restoredSession?.section ?? "recent"));
  let folderId = $state<string | undefined>(bootRoute?.name === "library" ? bootRoute.folderId : restoredSession?.folderId);
  let driveId = $state<string | undefined>(bootRoute?.name === "library" ? bootRoute.driveId : restoredSession?.driveId);
  let tabs = $state<WorkspaceTabState[]>(restoredSession?.tabs ?? []);
  let activeTabId = $state<string | null>(
    bootRoute?.name === "editor" && bootRoute.tabId && tabs.some((tab) => tab.id === bootRoute.tabId)
      ? bootRoute.tabId
      : (restoredSession?.activeTabId ?? null),
  );
  let libraryRevision = $state(0);
  let createOpen = $state(false);
  let debugStuffShow = $state(bootRoute?.name === "debug");
  let settingsOpen = $state(bootRoute?.name === "settings");
  let savedLabelsOpen = $state(false);
  let designer = $state<LabelDesigner | undefined>();
  let lastContentRoute = $state<AppRoute>(
    view === "editor" ? { name: "editor", tabId: activeTabId ?? undefined } : { name: "library", section, folderId, driveId },
  );

  const libraryRoute = (): AppRoute => ({ name: "library", section, folderId, driveId });

  const activeTab = $derived(tabs.find((tab) => tab.id === activeTabId));

  const newTabId = () => `tab_${FileUtils.timestamp()}_${Math.random().toString(36).slice(2, 7)}`;

  const snapshotDesigner = () => {
    if (!designer || !activeTabId) {
      return;
    }
    const snapshot = designer.getSnapshot();
    tabs = tabs.map((tab) =>
      tab.id === activeTabId
        ? {
            ...tab,
            title: snapshot.title || tab.title,
            snapshot,
            csvEnabled: designer!.getCsvEnabled(),
            sourceId: snapshot.id?.startsWith("saved_label") ? snapshot.id : tab.sourceId,
          }
        : tab,
    );
  };

  const showEditor = async (tabId: string, options?: { force?: boolean }) => {
    const leaving = view === "editor" && !!activeTabId && activeTabId !== tabId;
    if (leaving) {
      try {
        snapshotDesigner();
      } catch (error) {
        console.error(error);
      }
    }
    const alreadyOpen = view === "editor" && activeTabId === tabId && !!designer && !options?.force;
    activeTabId = tabId;
    view = "editor";
    await tick();
    if (alreadyOpen) {
      return;
    }
    const tab = tabs.find((item) => item.id === tabId);
    if (tab && designer) {
      try {
        await designer.applyLabel(tab.snapshot, tab.csvEnabled);
      } catch (error) {
        Toasts.error(error);
      }
    }
  };

  const applyRoute = (route: AppRoute) => {
    if (route.name === "settings") {
      settingsOpen = true;
      return;
    }
    if (route.name === "debug") {
      settingsOpen = false;
      debugStuffShow = true;
      return;
    }
    settingsOpen = false;
    debugStuffShow = false;
    lastContentRoute = route;
    if (route.name === "library") {
      snapshotDesigner();
      section = route.section;
      folderId = route.folderId;
      driveId = route.driveId;
      view = "library";
      libraryRevision += 1;
      return;
    }
    const tabId =
      (route.tabId && tabs.some((tab) => tab.id === route.tabId) ? route.tabId : undefined) ??
      (activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : undefined) ??
      tabs[0]?.id;
    if (!tabId) {
      navigateApp(libraryRoute(), "replace");
      return;
    }
    if (route.tabId !== tabId) {
      navigateApp({ name: "editor", tabId }, "replace");
      return;
    }
    void showEditor(tabId);
  };

  const openLabel = async (label: ExportedLabelTemplate, options?: { print?: boolean }) => {
    try {
      snapshotDesigner();
    } catch (error) {
      console.error(error);
    }
    try {
      const cloned = cloneLabelTemplate(label);
      if (isStarterTemplate(cloned.id)) {
        cloned.id = undefined;
      }
      const existing = cloned.id ? tabs.find((tab) => tab.sourceId === cloned.id) : undefined;
      if (existing) {
        navigateApp({ name: "editor", tabId: existing.id });
        await showEditor(existing.id);
        if (options?.print) {
          await tick();
          designer?.openPreview();
        }
        return;
      }
      const id = newTabId();
      tabs = [
        ...tabs,
        {
          id,
          title: cloned.title || $tr("editor.untitled"),
          sourceId: cloned.id,
          snapshot: cloned,
          csvEnabled: !!cloned.csv,
        },
      ];
      if (cloned.id) {
        LocalStoragePersistence.touchRecentLabel(cloned.id);
      }
      navigateApp({ name: "editor", tabId: id });
      await showEditor(id);
      if (options?.print) {
        await tick();
        designer?.openPreview();
      }
      persistSession();
    } catch (error) {
      Toasts.error(error);
    }
  };

  const createLabel = async (label: LabelProps, title: string) => {
    createOpen = false;
    await openLabel(emptyLabelTemplate(label, title));
  };

  const closeTab = async (id: string) => {
    const closingActive = id === activeTabId;
    if (closingActive) {
      snapshotDesigner();
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    tabs = tabs.filter((tab) => tab.id !== id);
    if (!closingActive) {
      return;
    }
    const next = tabs[index] ?? tabs[index - 1];
    if (next) {
      navigateApp({ name: "editor", tabId: next.id });
    } else {
      activeTabId = null;
      navigateApp(libraryRoute());
    }
  };

  const onSaved = () => {
    libraryRevision += 1;
    if (activeTab && designer) {
      const snapshot = designer.getSnapshot();
      tabs = tabs.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, title: snapshot.title || tab.title, snapshot, sourceId: snapshot.id ?? tab.sourceId }
          : tab,
      );
      if (snapshot.id) {
        LocalStoragePersistence.touchRecentLabel(snapshot.id);
      }
    }
  };

  const renameActiveTab = (title: string) => {
    const route = parseAppRoute();
    const tabId = route?.name === "editor" ? (route.tabId ?? activeTabId) : activeTabId;
    if (!tabId) {
      return;
    }
    tabs = tabs.map((tab) =>
      tab.id === tabId ? { ...tab, title, snapshot: { ...tab.snapshot, title } } : tab,
    );
  };

  const onLabelRenamed = (id: string, title: string) => {
    libraryRevision += 1;
    tabs = tabs.map((tab) =>
      tab.sourceId === id
        ? { ...tab, title, snapshot: { ...tab.snapshot, title } }
        : tab,
    );
    if (activeTab?.sourceId === id) {
      designer?.setLabelTitle(title);
    }
  };

  const persistSession = () => {
    if (view === "editor") {
      try {
        snapshotDesigner();
      } catch (error) {
        console.error(error);
      }
    }
    LocalStoragePersistence.saveWorkspaceSession({
      view,
      section,
      folderId,
      driveId,
      tabs,
      activeTabId,
    });
  };

  $effect(() => {
    if ($automation?.startPrint && tabs.length === 0) {
      navigateApp({ name: "editor" }, "replace");
    }
  });

  $effect(() => {
    if (settingsOpen) {
      return;
    }
    const route = parseAppRoute();
    if (route?.name === "settings") {
      navigateApp(lastContentRoute, "replace");
    }
  });

  $effect(() => {
    if (debugStuffShow) {
      return;
    }
    const route = parseAppRoute();
    if (route?.name === "debug") {
      navigateApp(lastContentRoute, "replace");
    }
  });

  $effect(() => {
    LocalStoragePersistence.saveWorkspaceSession({
      view,
      section,
      folderId,
      driveId,
      tabs,
      activeTabId,
    });
  });

  let attachedDesigner: LabelDesigner | undefined;

  $effect(() => {
    if (designer === attachedDesigner) {
      return;
    }
    attachedDesigner = designer;
    if (!designer || view !== "editor") {
      return;
    }
    const tabId =
      (activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : undefined) ?? tabs[0]?.id;
    if (tabId) {
      void showEditor(tabId, { force: true });
    }
  });

  onMount(() => {
    const boot = parseAppRoute();
    if (boot) {
      applyRoute(boot);
    } else if (!isShareHash()) {
      navigateApp(
        view === "editor" ? { name: "editor", tabId: activeTabId ?? undefined } : libraryRoute(),
        "replace",
      );
    }
    const onLeave = () => persistSession();
    const onLibraryChanged = () => {
      libraryRevision += 1;
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener(LIBRARY_CHANGED_EVENT, onLibraryChanged);
    const stopRoute = subscribeAppRoute(applyRoute);
    const stopShare = startLibraryShareRuntime();
    return () => {
      persistSession();
      stopRoute();
      stopShare();
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener(LIBRARY_CHANGED_EVENT, onLibraryChanged);
    };
  });

  $effect(() => {
    const desktop = getDesktop();
    document.documentElement.classList.toggle("is-desktop-window", !!desktop);
    if (desktop) {
      document.documentElement.dataset.platform = desktop.platform;
    }
  });
</script>

<div class="workspace">
  <WorkspaceTabBar
    tabs={tabs.map((tab) => ({ id: tab.id, title: tab.title }))}
    {activeTabId}
    librarySection={section}
    libraryFolderId={folderId}
    libraryDriveId={driveId}
    showHome={view === "library"}
    onClose={closeTab}
    onCreate={() => (createOpen = true)}>
    <PrinterConnector />
    <IconButton
      title={$tr("params.saved_labels.menu_title")}
      aria-label={$tr("params.saved_labels.menu_title")}
      onclick={() => (savedLabelsOpen = true)}>
      <MdIcon icon="sd_storage" />
    </IconButton>
    <IconButton href={settingsHref()} title={$tr("settings.title")}>
      <MdIcon icon="settings" />
    </IconButton>
  </WorkspaceTabBar>

  <div class="px-3">
    <BrowserWarning />
  </div>

  <div class="workspace-body">
    <div class="workspace-panel" class:is-hidden={view !== "library"}>
      <TemplateLibrary
        location={{ section, folderId, driveId }}
        revision={libraryRevision}
        onNavigate={(next) => navigateApp({ name: "library", ...next })}
        onCreate={() => (createOpen = true)}
        openTemplate={openLabel}
        {onLabelRenamed} />
    </div>
    <div class="workspace-panel" class:is-hidden={view !== "editor"}>
      <LabelDesigner
        bind:this={designer}
        autoLoad={false}
        onSaved={onSaved}
        fileRenamed={renameActiveTab}
        onUrlLoaded={openLabel}
        onBeforeUnmount={snapshotDesigner}
        onDeleted={() => {
          if (activeTabId) {
            void closeTab(activeTabId);
          }
        }} />
    </div>
  </div>

  <CreateLabelDialog bind:show={createOpen} onCreate={createLabel} />
  <SavedLabelsDialog
    bind:show={savedLabelsOpen}
    canUseCurrent={view === "editor" && !!designer}
    csvEnabled={view === "editor" && !!designer?.getCsvEnabled()}
    onRequestLabelTemplate={() => designer!.getSnapshot()}
    onLoadRequested={(label) => {
      savedLabelsOpen = false;
      void openLabel(label);
    }}
    onExportPng={() => designer?.exportPng()}
    onChanged={() => {
      libraryRevision += 1;
    }} />
  <SettingsDialog
    bind:show={settingsOpen}
    commit={appCommit}
    {buildDate}
    onDebug={() => navigateApp({ name: "debug" })} />

  {#if debugStuffShow}
    <DebugStuff bind:show={debugStuffShow} />
  {/if}
</div>
