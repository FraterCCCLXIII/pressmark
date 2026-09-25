import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const PREFIX = "/__pressmark/auth";
const STORE_PATH = resolve(process.cwd(), ".pressmark", "auth.json");
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const RESET_MS = 1000 * 60 * 60;

export type UserRole = "admin" | "user";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
};

type UserRecord = PublicUser & {
  passwordHash: string;
  salt: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

type Session = { token: string; userId: string; expiresAt: number };
type ResetToken = { token: string; userId: string; expiresAt: number };
type OutboxMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
  sentAt: number;
  delivered: boolean;
  resetUrl?: string;
  error?: string;
};

type AuthStore = {
  authEnabled: boolean;
  smtp: SmtpConfig | null;
  users: UserRecord[];
  sessions: Session[];
  resets: ResetToken[];
  outbox: OutboxMessage[];
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

const emptyStore = (): AuthStore => ({
  authEnabled: false,
  smtp: null,
  users: [],
  sessions: [],
  resets: [],
  outbox: [],
});

let store = emptyStore();
let loaded = false;
let storeMtime = 0;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const parseJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  try {
    return JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
};

const bearer = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return null;
};

const token = (bytes = 24) => randomBytes(bytes).toString("hex");
const now = () => Date.now();
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const hashPassword = (password: string, salt = randomBytes(16).toString("hex")) => ({
  salt,
  passwordHash: scryptSync(password, salt, 64).toString("hex"),
});

const verifyPassword = (password: string, salt: string, passwordHash: string) => {
  const next = scryptSync(password, salt, 64);
  const current = Buffer.from(passwordHash, "hex");
  return current.length === next.length && timingSafeEqual(current, next);
};

const publicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  disabled: user.disabled,
  createdAt: user.createdAt,
});

const save = () => {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const persistable: AuthStore = {
    ...store,
    sessions: store.sessions.filter((item) => item.expiresAt > now()),
    resets: store.resets.filter((item) => item.expiresAt > now()),
    outbox: store.outbox.slice(-30),
  };
  writeFileSync(STORE_PATH, JSON.stringify(persistable, null, 2));
  store = persistable;
  storeMtime = existsSync(STORE_PATH) ? statSync(STORE_PATH).mtimeMs : storeMtime;
};

export const loadAuthStore = () => {
  const exists = existsSync(STORE_PATH);
  const mtime = exists ? statSync(STORE_PATH).mtimeMs : 0;
  if (loaded && mtime === storeMtime) {
    return store;
  }
  if (exists) {
    try {
      store = { ...emptyStore(), ...(JSON.parse(readFileSync(STORE_PATH, "utf8")) as AuthStore) };
    } catch {
      if (!loaded) {
        store = emptyStore();
      }
    }
  } else if (!loaded) {
    store = emptyStore();
  }
  storeMtime = mtime;
  if (!loaded) {
    loaded = true;
    applyEnvBootstrap();
  }
  return store;
};

const envFlag = (value: string | undefined) => value === "1" || value?.toLowerCase() === "true";

const applyEnvBootstrap = () => {
  let dirty = false;
  if (envFlag(process.env.PRESSMARK_AUTH_ENABLED) && !store.authEnabled) {
    store.authEnabled = true;
    dirty = true;
  }
  if (process.env.PRESSMARK_SMTP_HOST) {
    store.smtp = {
      host: process.env.PRESSMARK_SMTP_HOST,
      port: Number(process.env.PRESSMARK_SMTP_PORT || 587),
      secure: envFlag(process.env.PRESSMARK_SMTP_SECURE),
      user: process.env.PRESSMARK_SMTP_USER || "",
      pass: process.env.PRESSMARK_SMTP_PASS || store.smtp?.pass || "",
      from: process.env.PRESSMARK_SMTP_FROM || process.env.PRESSMARK_ADMIN_EMAIL || "",
    };
    dirty = true;
  }
  const email = normalizeEmail(process.env.PRESSMARK_ADMIN_EMAIL);
  const password = String(process.env.PRESSMARK_ADMIN_PASSWORD || "");
  if (store.authEnabled && email && password && !store.users.some((user) => user.email === email)) {
    store.users.push({
      id: `user_${token(8)}`,
      email,
      name: "Admin",
      role: "admin",
      disabled: false,
      createdAt: now(),
      ...hashPassword(password),
    });
    dirty = true;
  }
  if (dirty || !existsSync(STORE_PATH)) {
    save();
  }
};

const requestOrigin = (req: IncomingMessage) => {
  const proto = String(req.headers["x-forwarded-proto"] || "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:5173");
  return `${proto}://${host}`;
};

const currentUser = (req: IncomingMessage): UserRecord | null => {
  const sessionToken = bearer(req);
  if (!sessionToken) {
    return null;
  }
  const session = store.sessions.find((item) => item.token === sessionToken && item.expiresAt > now());
  if (!session) {
    return null;
  }
  const user = store.users.find((item) => item.id === session.userId);
  return user && !user.disabled ? user : null;
};

const requireUser = (req: IncomingMessage, res: ServerResponse) => {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: "signin_required" });
    return null;
  }
  return user;
};

const requireAdmin = (req: IncomingMessage, res: ServerResponse) => {
  const user = requireUser(req, res);
  if (!user) {
    return null;
  }
  if (user.role !== "admin") {
    json(res, 403, { error: "admin_required" });
    return null;
  }
  return user;
};

const createSession = (userId: string) => {
  const session = { token: token(24), userId, expiresAt: now() + SESSION_MS };
  store.sessions.push(session);
  save();
  return session.token;
};

const createUser = (input: { email: string; name: string; password: string; role: UserRole }) => {
  const email = normalizeEmail(input.email);
  if (!email || !input.password || input.password.length < 8) {
    throw new Error("invalid_user");
  }
  if (store.users.some((user) => user.email === email)) {
    throw new Error("email_taken");
  }
  const user: UserRecord = {
    id: `user_${token(8)}`,
    email,
    name: input.name.trim() || email.split("@")[0] || "User",
    role: input.role,
    disabled: false,
    createdAt: now(),
    ...hashPassword(input.password),
  };
  store.users.push(user);
  save();
  return user;
};

const createReset = (user: UserRecord, origin: string) => {
  const reset = { token: token(24), userId: user.id, expiresAt: now() + RESET_MS };
  store.resets = store.resets.filter((item) => item.userId !== user.id);
  store.resets.push(reset);
  const resetUrl = `${origin}/#/reset/${reset.token}`;
  return { reset, resetUrl };
};

const sendMail = async (message: Omit<OutboxMessage, "id" | "sentAt" | "delivered">) => {
  const record: OutboxMessage = {
    id: `mail_${token(6)}`,
    sentAt: now(),
    delivered: false,
    ...message,
  };
  const smtp = store.smtp;
  if (!smtp?.host || !smtp.from) {
    store.outbox.push(record);
    save();
    return record;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    await transport.sendMail({ from: smtp.from, to: message.to, subject: message.subject, text: message.text });
    record.delivered = true;
  } catch (error) {
    record.error = error instanceof Error ? error.message : "send_failed";
  }
  store.outbox.push(record);
  save();
  return record;
};

const smtpPublic = () =>
  store.smtp
    ? {
        host: store.smtp.host,
        port: store.smtp.port,
        secure: store.smtp.secure,
        user: store.smtp.user,
        from: store.smtp.from,
        configured: true,
        hasPassword: !!store.smtp.pass,
      }
    : { configured: false, host: "", port: 587, secure: false, user: "", from: "", hasPassword: false };

export const handlePressmarkAuth = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  const raw = req.url ?? "";
  const path = raw.split("?")[0] ?? "";
  if (!path.startsWith(PREFIX)) {
    return false;
  }

  loadAuthStore();

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return true;
  }

  if (req.method === "GET" && path === `${PREFIX}/status`) {
    json(res, 200, {
      authEnabled: store.authEnabled,
      setupRequired: store.authEnabled && store.users.length === 0,
      canSetup: store.users.length === 0,
      smtpConfigured: !!store.smtp?.host,
    });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/setup`) {
    if (store.users.length > 0) {
      json(res, 409, { error: "already_setup" });
      return true;
    }
    const body = await parseJson(req);
    try {
      const admin = createUser({
        email: String(body.email ?? ""),
        name: String(body.name ?? "Admin"),
        password: String(body.password ?? ""),
        role: "admin",
      });
      store.authEnabled = true;
      if (body.smtp && typeof body.smtp === "object") {
        const smtp = body.smtp as Record<string, unknown>;
        store.smtp = {
          host: String(smtp.host ?? "").trim(),
          port: Number(smtp.port || 587),
          secure: Boolean(smtp.secure),
          user: String(smtp.user ?? ""),
          pass: String(smtp.pass ?? ""),
          from: String(smtp.from ?? admin.email),
        };
        if (!store.smtp.host) {
          store.smtp = null;
        }
      }
      save();
      json(res, 200, { user: publicUser(admin), token: createSession(admin.id) });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "invalid_user" });
    }
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/login`) {
    if (!store.authEnabled) {
      json(res, 400, { error: "auth_disabled" });
      return true;
    }
    const body = await parseJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const user = store.users.find((item) => item.email === email);
    if (!user || user.disabled || !verifyPassword(password, user.salt, user.passwordHash)) {
      json(res, 401, { error: "invalid_credentials" });
      return true;
    }
    json(res, 200, { user: publicUser(user), token: createSession(user.id) });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/logout`) {
    const sessionToken = bearer(req);
    store.sessions = store.sessions.filter((item) => item.token !== sessionToken);
    save();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && path === `${PREFIX}/me`) {
    const user = currentUser(req);
    if (!user) {
      json(res, 401, { error: "signin_required" });
      return true;
    }
    json(res, 200, { user: publicUser(user) });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/forgot`) {
    const body = await parseJson(req);
    const email = normalizeEmail(body.email);
    const user = store.users.find((item) => item.email === email && !item.disabled);
    if (user) {
      const origin = String(body.origin || requestOrigin(req));
      const { resetUrl } = createReset(user, origin);
      await sendMail({
        to: user.email,
        subject: "Reset your Pressmark password",
        text: `Reset your Pressmark password:\n\n${resetUrl}\n\nThis link expires in one hour.`,
        resetUrl,
      });
    }
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/reset`) {
    const body = await parseJson(req);
    const resetToken = String(body.token ?? "");
    const password = String(body.password ?? "");
    const reset = store.resets.find((item) => item.token === resetToken && item.expiresAt > now());
    const user = reset ? store.users.find((item) => item.id === reset.userId) : undefined;
    if (!reset || !user || password.length < 8) {
      json(res, 400, { error: "invalid_reset" });
      return true;
    }
    Object.assign(user, hashPassword(password));
    store.resets = store.resets.filter((item) => item.userId !== user.id);
    store.sessions = store.sessions.filter((item) => item.userId !== user.id);
    save();
    json(res, 200, { user: publicUser(user), token: createSession(user.id) });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/password`) {
    const user = requireUser(req, res);
    if (!user) {
      return true;
    }
    const body = await parseJson(req);
    const current = String(body.currentPassword ?? "");
    const nextPassword = String(body.password ?? "");
    if (!verifyPassword(current, user.salt, user.passwordHash) || nextPassword.length < 8) {
      json(res, 400, { error: "invalid_password" });
      return true;
    }
    Object.assign(user, hashPassword(nextPassword));
    save();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && path === `${PREFIX}/admin/users`) {
    if (!requireAdmin(req, res)) {
      return true;
    }
    json(res, 200, { users: store.users.map(publicUser) });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/admin/users`) {
    if (!requireAdmin(req, res)) {
      return true;
    }
    const body = await parseJson(req);
    try {
      const user = createUser({
        email: String(body.email ?? ""),
        name: String(body.name ?? ""),
        password: String(body.password ?? ""),
        role: body.role === "admin" ? "admin" : "user",
      });
      json(res, 200, { user: publicUser(user) });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "invalid_user" });
    }
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/admin/users/disable`) {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return true;
    }
    const body = await parseJson(req);
    const user = store.users.find((item) => item.id === body.userId);
    if (!user) {
      json(res, 404, { error: "not_found" });
      return true;
    }
    if (user.id === admin.id) {
      json(res, 400, { error: "cannot_disable_self" });
      return true;
    }
    if (user.role === "admin" && store.users.filter((item) => item.role === "admin" && !item.disabled).length < 2) {
      json(res, 400, { error: "last_admin" });
      return true;
    }
    user.disabled = Boolean(body.disabled);
    if (user.disabled) {
      store.sessions = store.sessions.filter((item) => item.userId !== user.id);
    }
    save();
    json(res, 200, { user: publicUser(user) });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/admin/users/reset`) {
    if (!requireAdmin(req, res)) {
      return true;
    }
    const body = await parseJson(req);
    const user = store.users.find((item) => item.id === body.userId);
    if (!user) {
      json(res, 404, { error: "not_found" });
      return true;
    }
    const password = String(body.password ?? "");
    if (password.length >= 8) {
      Object.assign(user, hashPassword(password));
      store.sessions = store.sessions.filter((item) => item.userId !== user.id);
      save();
      json(res, 200, { user: publicUser(user), resetUrl: null });
      return true;
    }
    const origin = String(body.origin || requestOrigin(req));
    const { resetUrl } = createReset(user, origin);
    const mail = await sendMail({
      to: user.email,
      subject: "Reset your Pressmark password",
      text: `An administrator requested a password reset:\n\n${resetUrl}\n\nThis link expires in one hour.`,
      resetUrl,
    });
    json(res, 200, { user: publicUser(user), resetUrl: mail.delivered ? null : resetUrl });
    return true;
  }

  if (req.method === "GET" && path === `${PREFIX}/admin/smtp`) {
    if (!requireAdmin(req, res)) {
      return true;
    }
    json(res, 200, { smtp: smtpPublic(), outbox: store.outbox.slice().reverse() });
    return true;
  }

  if (req.method === "PUT" && path === `${PREFIX}/admin/smtp`) {
    if (!requireAdmin(req, res)) {
      return true;
    }
    const body = await parseJson(req);
    const next: SmtpConfig = {
      host: String(body.host ?? "").trim(),
      port: Number(body.port || 587),
      secure: Boolean(body.secure),
      user: String(body.user ?? ""),
      pass: String(body.pass || store.smtp?.pass || ""),
      from: String(body.from ?? ""),
    };
    store.smtp = next.host ? next : null;
    save();
    json(res, 200, { smtp: smtpPublic() });
    return true;
  }

  if (req.method === "POST" && path === `${PREFIX}/admin/smtp/test`) {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return true;
    }
    const body = await parseJson(req);
    const to = normalizeEmail(body.to) || admin.email;
    const mail = await sendMail({
      to,
      subject: "Pressmark mail test",
      text: "Pressmark can send mail with the current SMTP settings.",
    });
    json(res, mail.delivered ? 200 : 400, { delivered: mail.delivered, error: mail.error, queued: !store.smtp?.host });
    return true;
  }

  json(res, 404, { error: "not_found" });
  return true;
};
