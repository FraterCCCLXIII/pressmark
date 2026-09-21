import type { ExportedLabelTemplate } from "$/types";
import {
  hostPath,
  PRESSMARK_HOST_VERSION,
  type HostInfo,
  type LibraryMutation,
  type LibrarySnapshot,
} from "$/utils/library_host";
import { normalizeOrigin } from "$/utils/library_tree";

export class RemoteLibraryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RemoteLibraryError";
  }
}

const headers = (token?: string, json = false): HeadersInit => {
  const next: Record<string, string> = {};
  if (json) {
    next["Content-Type"] = "application/json";
  }
  if (token) {
    next.Authorization = `Bearer ${token}`;
  }
  return next;
};

const readJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && data.error
        ? String(data.error)
        : `Request failed (${response.status})`;
    throw new RemoteLibraryError(message, response.status);
  }
  return data as T;
};

export const probePressmarkHost = async (origin: string): Promise<HostInfo> => {
  const response = await fetch(hostPath(normalizeOrigin(origin)), {
    headers: headers(),
  });
  const info = await readJson<HostInfo>(response);
  if (!info.ok) {
    throw new RemoteLibraryError("This address is not a Pressmark library host.");
  }
  return info;
};

export const fetchRemoteLibrary = async (origin: string, token: string): Promise<LibrarySnapshot> => {
  const response = await fetch(hostPath(normalizeOrigin(origin), "/library"), {
    headers: headers(token),
  });
  const snapshot = await readJson<LibrarySnapshot>(response);
  if (snapshot.version !== PRESSMARK_HOST_VERSION) {
    throw new RemoteLibraryError("This library uses an unsupported host version.");
  }
  return snapshot;
};

export const fetchRemoteLabel = async (
  origin: string,
  token: string,
  labelId: string,
): Promise<ExportedLabelTemplate> => {
  const snapshot = await fetchRemoteLibrary(origin, token);
  const label = snapshot.labels.find((item) => item.id === labelId);
  if (!label) {
    throw new RemoteLibraryError("Label was not found on the remote library.");
  }
  return label;
};

export const mutateRemoteLibrary = async (
  origin: string,
  token: string,
  mutation: LibraryMutation,
): Promise<LibrarySnapshot> => {
  const response = await fetch(hostPath(normalizeOrigin(origin), "/mutate"), {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(mutation),
  });
  return readJson<LibrarySnapshot>(response);
};

export const publishLocalLibrary = async (token: string, snapshot: LibrarySnapshot): Promise<void> => {
  const response = await fetch(hostPath(window.location.origin, "/publish"), {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(snapshot),
  });
  await readJson(response);
};

export const unpublishLocalLibrary = async (token: string): Promise<void> => {
  const response = await fetch(hostPath(window.location.origin, "/unpublish"), {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({}),
  });
  await readJson(response);
};

export const pullHostInbox = async (token: string): Promise<LibraryMutation[]> => {
  const response = await fetch(hostPath(window.location.origin, "/inbox"), {
    headers: headers(token),
  });
  const data = await readJson<{ mutations: LibraryMutation[] }>(response);
  return data.mutations ?? [];
};
