export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  disabled: boolean;
  createdAt: number;
};

export type AuthStatus = {
  authEnabled: boolean;
  setupRequired: boolean;
  canSetup: boolean;
  smtpConfigured: boolean;
};

export type SmtpPublic = {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
};

export type OutboxMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
  sentAt: number;
  delivered: boolean;
  resetUrl?: string;
  error?: string;
};

const PREFIX = "/__pressmark/auth";
const TOKEN_KEY = "pressmark_auth_token";

export const loadAuthToken = () => (typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN_KEY));

export const saveAuthToken = (token: string | null) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
};

const headers = (jsonBody = false): HeadersInit => {
  const next: Record<string, string> = {};
  if (jsonBody) {
    next["Content-Type"] = "application/json";
  }
  const token = loadAuthToken();
  if (token) {
    next.Authorization = `Bearer ${token}`;
  }
  return next;
};

class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

const read = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new AuthApiError(data && "error" in data && data.error ? String(data.error) : "request_failed", response.status, data?.error);
  }
  return data as T;
};

export const fetchAuthStatus = async (): Promise<AuthStatus> => {
  try {
    const response = await fetch(`${PREFIX}/status`);
    return await read<AuthStatus>(response);
  } catch {
    return { authEnabled: false, setupRequired: false, canSetup: false, smtpConfigured: false };
  }
};

export const setupAuth = async (body: {
  email: string;
  name: string;
  password: string;
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string; from: string };
}) => {
  const result = await read<{ user: AuthUser; token: string }>(
    await fetch(`${PREFIX}/setup`, { method: "POST", headers: headers(true), body: JSON.stringify(body) }),
  );
  saveAuthToken(result.token);
  return result.user;
};

export const loginAuth = async (email: string, password: string) => {
  const result = await read<{ user: AuthUser; token: string }>(
    await fetch(`${PREFIX}/login`, { method: "POST", headers: headers(true), body: JSON.stringify({ email, password }) }),
  );
  saveAuthToken(result.token);
  return result.user;
};

export const logoutAuth = async () => {
  try {
    await fetch(`${PREFIX}/logout`, { method: "POST", headers: headers() });
  } finally {
    saveAuthToken(null);
  }
};

export const fetchAuthMe = async () => {
  const token = loadAuthToken();
  if (!token) {
    return null;
  }
  const response = await fetch(`${PREFIX}/me`, { headers: headers() });
  if (response.status === 401) {
    saveAuthToken(null);
    return null;
  }
  const result = await read<{ user: AuthUser }>(response);
  return result.user;
};

export const requestPasswordReset = async (email: string) =>
  read<{ ok: true }>(
    await fetch(`${PREFIX}/forgot`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ email, origin: window.location.origin }),
    }),
  );

export const resetPassword = async (token: string, password: string) => {
  const result = await read<{ user: AuthUser; token: string }>(
    await fetch(`${PREFIX}/reset`, { method: "POST", headers: headers(true), body: JSON.stringify({ token, password }) }),
  );
  saveAuthToken(result.token);
  return result.user;
};

export const changePassword = async (currentPassword: string, password: string) =>
  read<{ ok: true }>(
    await fetch(`${PREFIX}/password`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ currentPassword, password }),
    }),
  );

export const fetchAdminUsers = async () =>
  (await read<{ users: AuthUser[] }>(await fetch(`${PREFIX}/admin/users`, { headers: headers() }))).users;

export const createAdminUser = async (body: { email: string; name: string; password: string; role: "admin" | "user" }) =>
  read<{ user: AuthUser }>(
    await fetch(`${PREFIX}/admin/users`, { method: "POST", headers: headers(true), body: JSON.stringify(body) }),
  );

export const setUserDisabled = async (userId: string, disabled: boolean) =>
  read<{ user: AuthUser }>(
    await fetch(`${PREFIX}/admin/users/disable`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ userId, disabled }),
    }),
  );

export const adminResetUser = async (userId: string, password?: string) =>
  read<{ user: AuthUser; resetUrl: string | null }>(
    await fetch(`${PREFIX}/admin/users/reset`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ userId, password, origin: window.location.origin }),
    }),
  );

export const fetchSmtp = async () =>
  read<{ smtp: SmtpPublic; outbox: OutboxMessage[] }>(await fetch(`${PREFIX}/admin/smtp`, { headers: headers() }));

export const saveSmtp = async (body: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}) =>
  read<{ smtp: SmtpPublic }>(
    await fetch(`${PREFIX}/admin/smtp`, { method: "PUT", headers: headers(true), body: JSON.stringify(body) }),
  );

export const testSmtp = async (to?: string) =>
  read<{ delivered: boolean; error?: string; queued?: boolean }>(
    await fetch(`${PREFIX}/admin/smtp/test`, { method: "POST", headers: headers(true), body: JSON.stringify({ to }) }),
  );
