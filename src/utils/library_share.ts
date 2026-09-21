import type { ExportedLabelTemplate } from "$/types";
import { LIBRARY_CHANGED_EVENT, notifyLibraryChanged, snapshotFromLocal, type LibraryMutation } from "$/utils/library_host";
import { pullHostInbox, publishLocalLibrary, unpublishLocalLibrary } from "$/utils/library_remote";
import { loadLibraryIndex, loadLibraryShare, saveLibraryIndex, saveLibraryShare, syncLibraryPlacements } from "$/utils/library_store";
import { applyFolderMutation } from "$/utils/library_tree";
import { LocalStoragePersistence } from "$/utils/persistence";

const SYNC_MS = 2000;
const SW_URL = "/pressmark-host-sw.js";

let timer: number | undefined;
let publishing = false;

const applyLocalMutation = (mutation: LibraryMutation) => {
  if (mutation.type === "upsertLabel") {
    const labels = LocalStoragePersistence.loadLabels();
    const id = mutation.label.id;
    const next = id ? [...labels.filter((item) => item.id !== id), mutation.label] : [...labels, mutation.label];
    LocalStoragePersistence.saveLabels(next);
    if (mutation.label.id) {
      saveLibraryIndex(
        applyFolderMutation(loadLibraryIndex(), {
          type: "moveLabel",
          labelId: mutation.label.id,
          folderId: mutation.folderId,
        }),
      );
    }
    return;
  }
  if (mutation.type === "deleteLabel") {
    const next = LocalStoragePersistence.loadLabels().filter((item) => item.id !== mutation.labelId);
    LocalStoragePersistence.saveLabels(next);
    return;
  }
  saveLibraryIndex(applyFolderMutation(loadLibraryIndex(), mutation));
};

const currentSnapshot = () => {
  const share = loadLibraryShare();
  return snapshotFromLocal(share.name, loadLibraryIndex(), LocalStoragePersistence.loadLabels());
};

const publishIfEnabled = async () => {
  const share = loadLibraryShare();
  if (!share.enabled || publishing) {
    return;
  }
  publishing = true;
  try {
    try {
      const inbox = await pullHostInbox(share.token);
      if (inbox.length) {
        inbox.forEach(applyLocalMutation);
        notifyLibraryChanged();
      }
    } catch {
      // Host may not have a snapshot yet on the first publish.
    }
    await publishLocalLibrary(share.token, currentSnapshot());
  } catch (error) {
    console.warn("Pressmark library share sync failed:", error);
  } finally {
    publishing = false;
  }
};

const registerHostWorker = async () => {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) {
    return;
  }
  try {
    await navigator.serviceWorker.register(SW_URL);
  } catch (error) {
    console.warn("Pressmark host worker was not registered:", error);
  }
};

const onWorkerMessage = (event: MessageEvent) => {
  const data = event.data as {
    type?: string;
    method?: string;
    path?: string;
    headers?: { authorization?: string | null };
    body?: string | null;
  } | null;
  if (!data || data.type !== "pressmark-host-request" || !event.ports[0]) {
    return;
  }
  const share = loadLibraryShare();
  const token = data.headers?.authorization?.replace(/^Bearer\s+/i, "");
  const authorized = !!share.enabled && !!token && token === share.token;
  const path = data.path ?? "";

  if (data.method === "OPTIONS") {
    event.ports[0].postMessage({ status: 204, body: {} });
    return;
  }
  if (path.endsWith("/__pressmark/host")) {
    event.ports[0].postMessage({
      status: 200,
      body: { ok: true, version: 1, sharing: share.enabled, name: share.enabled ? share.name : undefined },
    });
    return;
  }
  if (!authorized) {
    event.ports[0].postMessage({ status: 401, body: { error: "invalid_token" } });
    return;
  }
  if (path.endsWith("/library")) {
    event.ports[0].postMessage({ status: 200, body: currentSnapshot() });
    return;
  }
  if (path.endsWith("/mutate") && data.body) {
    try {
      const mutation = JSON.parse(data.body) as LibraryMutation;
      applyLocalMutation(mutation);
      notifyLibraryChanged();
      event.ports[0].postMessage({ status: 200, body: currentSnapshot() });
    } catch {
      event.ports[0].postMessage({ status: 400, body: { error: "invalid_mutation" } });
    }
    return;
  }
  event.ports[0].postMessage({ status: 404, body: { error: "not_found" } });
};

export const startLibraryShareRuntime = () => {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
  const onChanged = () => {
    void publishIfEnabled();
  };
  window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged);
  void registerHostWorker();
  void publishIfEnabled();
  timer = window.setInterval(() => {
    void publishIfEnabled();
  }, SYNC_MS);
  return () => {
    if (timer) {
      window.clearInterval(timer);
      timer = undefined;
    }
    window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged);
    navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
  };
};

export const setLibrarySharing = async (enabled: boolean) => {
  const share = loadLibraryShare();
  share.enabled = enabled;
  saveLibraryShare(share);
  if (!enabled) {
    try {
      await unpublishLocalLibrary(share.token);
    } catch {
      // Host may already be empty.
    }
    return;
  }
  await registerHostWorker();
  await publishIfEnabled();
};

export const bumpLibraryShare = (labels?: ExportedLabelTemplate[]) => {
  if (labels) {
    syncLibraryPlacements(labels.map((label) => label.id).filter((id): id is string => !!id));
  }
  notifyLibraryChanged();
};
