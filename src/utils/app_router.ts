export const LIBRARY_SECTIONS = ["recent", "mine", "history", "catalog", "drive"] as const;

export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export type LibraryLocation = {
  section: LibrarySection;
  folderId?: string;
  driveId?: string;
};

export type AppRoute =
  | ({ name: "library" } & LibraryLocation)
  | { name: "editor"; tabId?: string }
  | { name: "settings" }
  | { name: "debug" }
  | { name: "setup" }
  | { name: "login" }
  | { name: "forgot" }
  | { name: "reset"; token: string }
  | { name: "admin" };

export const isAuthRoute = (route: AppRoute | null): route is Extract<AppRoute, { name: "setup" | "login" | "forgot" | "reset" | "admin" }> =>
  !!route && (route.name === "setup" || route.name === "login" || route.name === "forgot" || route.name === "reset" || route.name === "admin");

const ROUTE_EVENT = "nb:route";

const isLibrarySection = (value: string | undefined): value is LibrarySection =>
  !!value && (LIBRARY_SECTIONS as readonly string[]).includes(value);

const hashPath = (hash = globalThis.location?.hash ?? ""): string => {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return decodeURIComponent(raw.split("&")[0] ?? "");
};

export const isShareHash = (hash = globalThis.location?.hash ?? ""): boolean => {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) {
    return false;
  }
  return raw.startsWith("load=") || raw.startsWith("uload=") || raw.includes("&load=") || raw.includes("&uload=");
};

export const parseAppRoute = (hash = globalThis.location?.hash ?? ""): AppRoute | null => {
  if (isShareHash(hash)) {
    return null;
  }
  const path = hashPath(hash);
  if (!path.startsWith("/")) {
    return null;
  }
  const [page, param, extra, nested] = path.split("/").filter(Boolean);
  if (page === "library") {
    if (param === "drive") {
      return { name: "library", section: "drive", driveId: extra, folderId: nested };
    }
    return {
      name: "library",
      section: isLibrarySection(param) ? param : "recent",
      folderId: extra,
    };
  }
  if (page === "editor") {
    return { name: "editor", tabId: param };
  }
  if (page === "settings") {
    return { name: "settings" };
  }
  if (page === "debug") {
    return { name: "debug" };
  }
  if (page === "setup") {
    return { name: "setup" };
  }
  if (page === "login") {
    return { name: "login" };
  }
  if (page === "forgot") {
    return { name: "forgot" };
  }
  if (page === "reset") {
    return { name: "reset", token: param ?? "" };
  }
  if (page === "admin") {
    return { name: "admin" };
  }
  return { name: "library", section: "recent" };
};

export const appRouteHash = (route: AppRoute): string => {
  if (route.name === "library") {
    if (route.section === "drive") {
      const drive = route.driveId ? `/${encodeURIComponent(route.driveId)}` : "";
      const folder = route.folderId ? `/${encodeURIComponent(route.folderId)}` : "";
      return `#/library/drive${drive}${folder}`;
    }
    const folder = route.folderId ? `/${encodeURIComponent(route.folderId)}` : "";
    return `#/library/${route.section}${folder}`;
  }
  if (route.name === "editor") {
    return route.tabId ? `#/editor/${encodeURIComponent(route.tabId)}` : "#/editor";
  }
  if (route.name === "reset") {
    return route.token ? `#/reset/${encodeURIComponent(route.token)}` : "#/reset";
  }
  if (route.name === "settings") {
    return "#/settings";
  }
  if (route.name === "debug") {
    return "#/debug";
  }
  return `#/${route.name}`;
};

export const libraryHref = (section: LibrarySection | LibraryLocation = "recent", extras?: Omit<LibraryLocation, "section">): string => {
  if (typeof section === "string") {
    return appRouteHash({ name: "library", section, ...extras });
  }
  return appRouteHash({ name: "library", ...section });
};

export const editorHref = (tabId?: string): string => appRouteHash({ name: "editor", tabId });

export const settingsHref = (): string => appRouteHash({ name: "settings" });

export const debugHref = (): string => appRouteHash({ name: "debug" });

export const setupHref = (): string => appRouteHash({ name: "setup" });

export const loginHref = (): string => appRouteHash({ name: "login" });

export const forgotHref = (): string => appRouteHash({ name: "forgot" });

export const resetHref = (token: string): string => appRouteHash({ name: "reset", token });

export const adminHref = (): string => appRouteHash({ name: "admin" });

export const currentAppRoute = (): AppRoute | null => parseAppRoute();

export const sameLibraryLocation = (left: LibraryLocation, right: LibraryLocation): boolean =>
  left.section === right.section && (left.folderId ?? "") === (right.folderId ?? "") && (left.driveId ?? "") === (right.driveId ?? "");

export const sameAppRoute = (left: AppRoute, right: AppRoute): boolean => {
  if (left.name !== right.name) {
    return false;
  }
  if (left.name === "library" && right.name === "library") {
    return sameLibraryLocation(left, right);
  }
  if (left.name === "editor" && right.name === "editor") {
    return (left.tabId ?? "") === (right.tabId ?? "");
  }
  if (left.name === "reset" && right.name === "reset") {
    return left.token === right.token;
  }
  return true;
};

export const navigateApp = (route: AppRoute, mode: "push" | "replace" = "push") => {
  if (typeof window === "undefined") {
    return;
  }
  const next = appRouteHash(route);
  if (window.location.hash === next) {
    return;
  }
  if (mode === "replace") {
    window.history.replaceState(window.history.state, "", next);
  } else {
    window.history.pushState(window.history.state, "", next);
  }
  window.dispatchEvent(new Event(ROUTE_EVENT));
};

export const subscribeAppRoute = (onRoute: (route: AppRoute) => void): (() => void) => {
  const notify = () => {
    const route = parseAppRoute();
    if (route) {
      onRoute(route);
    }
  };
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  window.addEventListener(ROUTE_EVENT, notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
    window.removeEventListener(ROUTE_EVENT, notify);
  };
};
