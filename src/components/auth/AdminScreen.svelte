<script lang="ts">
  import { onMount } from "svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button, SelectField, TextField } from "$/components/ui";
  import {
    adminResetUser,
    createAdminUser,
    fetchAdminUsers,
    fetchSmtp,
    saveSmtp,
    setUserDisabled,
    testSmtp,
    type AuthUser,
    type OutboxMessage,
    type SmtpPublic,
  } from "$/utils/auth_api";
  import { libraryHref } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  let users = $state<AuthUser[]>([]);
  let smtp = $state<SmtpPublic>({
    configured: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    from: "",
    hasPassword: false,
  });
  let outbox = $state<OutboxMessage[]>([]);
  let email = $state("");
  let name = $state("");
  let password = $state("");
  let role = $state<"admin" | "user">("user");
  let smtpPass = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);

  const load = async () => {
    const [nextUsers, mail] = await Promise.all([fetchAdminUsers(), fetchSmtp()]);
    users = nextUsers;
    smtp = mail.smtp;
    outbox = mail.outbox;
  };

  const showError = (caught: unknown) => {
    error = caught instanceof Error ? caught.message : $tr("auth.admin.failed");
  };

  const addUser = async () => {
    busy = true;
    error = "";
    notice = "";
    try {
      await createAdminUser({ email, name, password, role });
      email = "";
      name = "";
      password = "";
      role = "user";
      await load();
    } catch (caught) {
      showError(caught);
    } finally {
      busy = false;
    }
  };

  const persistSmtp = async () => {
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await saveSmtp({
        host: smtp.host,
        port: Number(smtp.port || 587),
        secure: smtp.secure,
        user: smtp.user,
        pass: smtpPass,
        from: smtp.from,
      });
      smtp = result.smtp;
      smtpPass = "";
      notice = $tr("auth.smtp.saved");
    } catch (caught) {
      showError(caught);
    } finally {
      busy = false;
    }
  };

  const sendTest = async () => {
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await testSmtp();
      await load();
      notice = result.queued ? $tr("auth.smtp.queued") : $tr("auth.smtp.sent");
    } catch (caught) {
      showError(caught);
    } finally {
      busy = false;
    }
  };

  onMount(() => {
    void load().catch(showError);
  });
</script>

<div class="admin-screen">
  <header class="admin-head">
    <a href={libraryHref("recent")}>
      <MdIcon icon="chevron_left" />
      {$tr("editor.home")}
    </a>
    <div>
      <p class="admin-brand">Pressmark</p>
      <h1>{$tr("auth.admin.title")}</h1>
    </div>
  </header>

  {#if error}
    <p class="auth-error">{error}</p>
  {/if}
  {#if notice}
    <p class="auth-note">{notice}</p>
  {/if}

  <section class="admin-card">
    <h2>{$tr("auth.admin.users")}</h2>
    <div class="admin-table">
      {#each users as item (item.id)}
        <div class="admin-user">
          <div>
            <strong>{item.name}</strong>
            <span>{item.email}</span>
          </div>
          <span class="admin-role">{item.role}{item.disabled ? ` · ${$tr("auth.admin.disabled")}` : ""}</span>
          <div class="admin-actions">
            <Button
              size="sm"
              onclick={() =>
                void setUserDisabled(item.id, !item.disabled)
                  .then(load)
                  .catch(showError)}>
              {item.disabled ? $tr("auth.admin.enable") : $tr("auth.admin.disable")}
            </Button>
            <Button
              size="sm"
              onclick={() =>
                void adminResetUser(item.id)
                  .then(async (result) => {
                    await load();
                    notice = result.resetUrl ? $tr("auth.admin.reset_link") : $tr("auth.admin.reset_sent");
                    if (result.resetUrl) {
                      notice = `${notice} ${result.resetUrl}`;
                    }
                  })
                  .catch(showError)}>
              {$tr("auth.forgot.action")}
            </Button>
          </div>
        </div>
      {/each}
    </div>
    <form
      class="auth-form"
      onsubmit={(event) => {
        event.preventDefault();
        void addUser();
      }}>
      <h3>{$tr("auth.admin.add")}</h3>
      <label>
        <span>{$tr("auth.name")}</span>
        <TextField bind:value={name} />
      </label>
      <label>
        <span>{$tr("auth.email")}</span>
        <TextField type="email" bind:value={email} />
      </label>
      <label>
        <span>{$tr("auth.password")}</span>
        <TextField type="password" autocomplete="new-password" bind:value={password} />
      </label>
      <label>
        <span>{$tr("auth.admin.role")}</span>
        <SelectField bind:value={role}>
          <option value="user">{$tr("auth.admin.role.user")}</option>
          <option value="admin">{$tr("auth.admin.role.admin")}</option>
        </SelectField>
      </label>
      <Button variant="primary" type="submit" disabled={busy || !email.trim() || password.length < 8}>
        {$tr("auth.admin.add")}
      </Button>
    </form>
  </section>

  <section class="admin-card">
    <h2>{$tr("auth.smtp.title")}</h2>
    <p class="auth-note">{$tr("auth.smtp.help")}</p>
    <form
      class="auth-form"
      onsubmit={(event) => {
        event.preventDefault();
        void persistSmtp();
      }}>
      <label>
        <span>{$tr("auth.smtp.host")}</span>
        <TextField bind:value={smtp.host} />
      </label>
      <label>
        <span>{$tr("auth.smtp.port")}</span>
        <TextField type="number" value={String(smtp.port)} oninput={(event) => (smtp.port = Number(event.currentTarget.value || 587))} />
      </label>
      <label class="auth-check">
        <input type="checkbox" bind:checked={smtp.secure} />
        {$tr("auth.smtp.secure")}
      </label>
      <label>
        <span>{$tr("auth.smtp.user")}</span>
        <TextField bind:value={smtp.user} />
      </label>
      <label>
        <span>
          {$tr("auth.smtp.pass")}
          {#if smtp.hasPassword}
            ({$tr("auth.smtp.pass_set")})
          {/if}
        </span>
        <TextField type="password" autocomplete="new-password" bind:value={smtpPass} />
      </label>
      <label>
        <span>{$tr("auth.smtp.from")}</span>
        <TextField type="email" bind:value={smtp.from} />
      </label>
      <div class="admin-actions">
        <Button variant="primary" type="submit" disabled={busy}>{$tr("editor.save")}</Button>
        <Button type="button" onclick={() => void sendTest()} disabled={busy}>{$tr("auth.smtp.test")}</Button>
      </div>
    </form>
  </section>

  {#if outbox.length}
    <section class="admin-card">
      <h2>{$tr("auth.outbox.title")}</h2>
      <p class="auth-note">{$tr("auth.outbox.help")}</p>
      <div class="admin-table">
        {#each outbox as message (message.id)}
          <div class="admin-user">
            <div>
              <strong>{message.subject}</strong>
              <span>{message.to}</span>
              {#if message.resetUrl}
                <a href={message.resetUrl}>{message.resetUrl}</a>
              {/if}
              {#if message.error}
                <span class="auth-error">{message.error}</span>
              {/if}
            </div>
            <span class="admin-role">{message.delivered ? $tr("auth.smtp.sent") : $tr("auth.smtp.queued")}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .admin-screen {
    position: fixed;
    inset: 0;
    z-index: 40;
    overflow: auto;
    min-height: 100vh;
    padding: 28px 20px 48px;
    background: var(--ws-bg, #f6f6f6);
  }

  .admin-head {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    max-width: 760px;
    margin: 0 auto 20px;
  }

  .admin-head a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 18px;
    color: var(--ws-muted);
    text-decoration: none;
  }

  .admin-brand {
    margin: 0 0 4px;
    color: var(--ws-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }

  h2,
  h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }

  .admin-card,
  .auth-error,
  .auth-note {
    max-width: 760px;
    margin: 0 auto 16px;
  }

  .admin-card {
    padding: 20px;
    border: 1px solid var(--ws-line);
    border-radius: 16px;
    background: var(--ws-surface);
  }

  .admin-table {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }

  .admin-user {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .admin-user div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .admin-user span,
  .admin-role {
    color: var(--ws-muted);
    font-size: 13px;
  }

  .admin-user a {
    color: var(--ws-accent);
    word-break: break-all;
  }

  .admin-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
