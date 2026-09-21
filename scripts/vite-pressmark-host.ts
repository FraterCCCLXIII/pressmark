import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const PREFIX = "/__pressmark/host";

type Snapshot = {
  version: number;
  name: string;
  publishedAt: number;
  folders: unknown[];
  labels: unknown[];
  placements: Record<string, { folderId: string | null }>;
};

type Mutation = { type: string } & Record<string, unknown>;

type HostState = {
  token: string | null;
  snapshot: Snapshot | null;
  inbox: Mutation[];
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
};

const empty = (res: ServerResponse, status: number) => {
  res.writeHead(status, cors);
  res.end();
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const bearer = (req: IncomingMessage, url: URL): string | null => {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return url.searchParams.get("token");
};

const applyMutation = (snapshot: Snapshot, mutation: Mutation): Snapshot => {
  const folders = Array.isArray(snapshot.folders) ? [...snapshot.folders] : [];
  const labels = Array.isArray(snapshot.labels) ? [...snapshot.labels] : [];
  const placements = { ...snapshot.placements };

  if (mutation.type === "createFolder") {
    const id = typeof mutation.id === "string" ? mutation.id : `folder_${Date.now()}`;
    if (!folders.some((folder) => typeof folder === "object" && folder && "id" in folder && folder.id === id)) {
      folders.push({
        id,
        name: String(mutation.name ?? "Folder"),
        parentId: mutation.parentId ?? null,
        createdAt: Date.now(),
      });
    }
  } else if (mutation.type === "renameFolder") {
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      if (folder && typeof folder === "object" && "id" in folder && folder.id === mutation.id) {
        folders[i] = { ...folder, name: String(mutation.name ?? "") };
      }
    }
  } else if (mutation.type === "deleteFolder") {
    const current = folders.find(
      (folder) => folder && typeof folder === "object" && "id" in folder && folder.id === mutation.id,
    ) as { parentId?: string | null } | undefined;
    const parentId = current?.parentId ?? null;
    const nextFolders = folders
      .filter((folder) => !(folder && typeof folder === "object" && "id" in folder && folder.id === mutation.id))
      .map((folder) => {
        if (folder && typeof folder === "object" && "parentId" in folder && folder.parentId === mutation.id) {
          return { ...folder, parentId };
        }
        return folder;
      });
    folders.splice(0, folders.length, ...nextFolders);
    for (const [labelId, placement] of Object.entries(placements)) {
      if (placement.folderId === mutation.id) {
        placements[labelId] = { folderId: parentId };
      }
    }
  } else if (mutation.type === "moveFolder") {
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      if (folder && typeof folder === "object" && "id" in folder && folder.id === mutation.id) {
        folders[i] = { ...folder, parentId: mutation.parentId ?? null };
      }
    }
  } else if (mutation.type === "moveLabel" && typeof mutation.labelId === "string") {
    placements[mutation.labelId] = { folderId: (mutation.folderId as string | null) ?? null };
  } else if (mutation.type === "upsertLabel" && mutation.label && typeof mutation.label === "object") {
    const label = mutation.label as { id?: string };
    const next = label.id ? labels.filter((item) => !(item && typeof item === "object" && "id" in item && item.id === label.id)) : labels;
    next.push(mutation.label);
    labels.splice(0, labels.length, ...next);
    if (label.id) {
      placements[label.id] = { folderId: (mutation.folderId as string | null) ?? null };
    }
  } else if (mutation.type === "deleteLabel" && typeof mutation.labelId === "string") {
    const next = labels.filter((item) => !(item && typeof item === "object" && "id" in item && item.id === mutation.labelId));
    labels.splice(0, labels.length, ...next);
    delete placements[mutation.labelId];
  }

  return { ...snapshot, folders, labels, placements, publishedAt: Date.now() };
};

const handle = (state: HostState) => async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const raw = req.url ?? "";
  if (!raw.startsWith(PREFIX) && !raw.split("?")[0]?.startsWith(PREFIX)) {
    next();
    return;
  }

  const url = new URL(raw, "http://pressmark.local");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    empty(res, 204);
    return;
  }

  if (req.method === "GET" && path === PREFIX) {
    json(res, 200, {
      ok: true,
      version: 1,
      sharing: !!state.snapshot && !!state.token,
      name: state.snapshot?.name,
    });
    return;
  }

  const token = bearer(req, url);

  if (req.method === "POST" && path === `${PREFIX}/publish`) {
    const body = JSON.parse((await readBody(req)) || "{}") as Snapshot;
    if (!token) {
      json(res, 401, { error: "invalid_token" });
      return;
    }
    state.token = token;
    state.snapshot = body;
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && path === `${PREFIX}/unpublish`) {
    if (!state.token || token !== state.token) {
      json(res, 401, { error: "invalid_token" });
      return;
    }
    state.token = null;
    state.snapshot = null;
    state.inbox = [];
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && path === `${PREFIX}/inbox`) {
    if (state.token && token !== state.token) {
      json(res, 401, { error: "invalid_token" });
      return;
    }
    const mutations = state.inbox;
    state.inbox = [];
    json(res, 200, { mutations });
    return;
  }

  if (!state.token || token !== state.token || !state.snapshot) {
    json(res, 401, { error: state.snapshot ? "invalid_token" : "not_sharing" });
    return;
  }

  if (req.method === "GET" && path === `${PREFIX}/library`) {
    json(res, 200, state.snapshot);
    return;
  }

  if (req.method === "POST" && path === `${PREFIX}/mutate`) {
    const mutation = JSON.parse((await readBody(req)) || "{}") as Mutation;
    if (!mutation?.type) {
      json(res, 400, { error: "invalid_mutation" });
      return;
    }
    state.snapshot = applyMutation(state.snapshot, mutation);
    state.inbox.push(mutation);
    json(res, 200, state.snapshot);
    return;
  }

  json(res, 404, { error: "not_found" });
};

export const pressmarkLibraryHost = (): Plugin => {
  const state: HostState = { token: null, snapshot: null, inbox: [] };
  return {
    name: "pressmark-library-host",
    configureServer(server) {
      server.middlewares.use(handle(state));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle(state));
    },
  };
};
