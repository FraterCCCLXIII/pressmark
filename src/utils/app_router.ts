export const LIBRARY_SECTIONS = ["recent", "mine", "history", "catalog", "drive", "forms"] as const;

export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export type LibraryLocation = {
  section: LibrarySection;
  folderId?: string;
  driveId?: string;
};

export type AppRoute =
  | ({ name: "library" } & LibraryLocation)
  | { name: "editor"; tabId?: string }
  | { name: "form"; formId: string }
  | { name: "settings" }
  | { name: "debug" };

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
  if (page === "form") {
    return param ? { name: "form", formId: param } : { name: "library", section: "forms" };
  }
  if (page === "settings") {
    return { name: "settings" };
  }
  if (page === "debug") {
    return { name: "debug" };
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
  if (route.name === "form") {
    return `#/form/${encodeURIComponent(route.formId)}`;
  }
  return route.name === "settings" ? "#/settings" : "#/debug";
};

export const libraryHref = (section: LibrarySection | LibraryLocation = "recent", extras?: Omit<LibraryLocation, "section">): string => {
  if (typeof section === "string") {
    return appRouteHash({ name: "library", section, ...extras });
  }
  return appRouteHash({ name: "library", ...section });
};

export const editorHref = (tabId?: string): string => appRouteHash({ name: "editor", tabId });

export const formHref = (formId: string): string => appRouteHash({ name: "form", formId });

export const formsHref = (): string => libraryHref("forms");

export const settingsHref = (): string => appRouteHash({ name: "settings" });

export const debugHref = (): string => appRouteHash({ name: "debug" });

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
  if (left.name === "form" && right.name === "form") {
    return left.formId === right.formId;
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
