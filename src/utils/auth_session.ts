import { writable } from "svelte/store";
import {
  fetchAuthMe,
  fetchAuthStatus,
  logoutAuth,
  type AuthStatus,
  type AuthUser,
} from "$/utils/auth_api";
import { getDesktop } from "$/utils/desktop";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLocalRuntime = () => {
  if (typeof window === "undefined") {
    return true;
  }
  if (getDesktop()) {
    return true;
  }
  if (localHosts.has(window.location.hostname)) {
    return true;
  }
  return import.meta.env.DEV;
};

const requireAuthLocally = () => {
  if (typeof window === "undefined") {
    return false;
  }
  if (new URLSearchParams(window.location.search).get("auth") === "1") {
    return true;
  }
  return import.meta.env.VITE_PRESSMARK_REQUIRE_AUTH === "true";
};

/** Local Vite, localhost, and the desktop app skip the sign-in wall. */
export const shouldBypassAuthGate = () => isLocalRuntime() && !requireAuthLocally();

export type AuthState = AuthStatus & {
  ready: boolean;
  user: AuthUser | null;
};

const initial: AuthState = {
  ready: false,
  authEnabled: false,
  setupRequired: false,
  canSetup: false,
  smtpConfigured: false,
  user: null,
};

export const auth = writable<AuthState>(initial);

export const refreshAuth = async () => {
  const status = await fetchAuthStatus();
  const bypass = shouldBypassAuthGate();
  const user = !bypass && status.authEnabled ? await fetchAuthMe() : null;
  const next = {
    ready: true,
    ...status,
    authEnabled: bypass ? false : status.authEnabled,
    setupRequired: bypass ? false : status.setupRequired,
    canSetup: bypass ? false : status.canSetup,
    user,
  };
  auth.set(next);
  return next;
};

export const startAuthSession = () => {
  void refreshAuth();
  return () => undefined;
};

export const signOut = async () => {
  await logoutAuth();
  await refreshAuth();
};
