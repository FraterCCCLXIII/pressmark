<script lang="ts">
  import AuthLayout from "$/components/auth/AuthLayout.svelte";
  import { Button, TextField } from "$/components/ui";
  import { setupAuth } from "$/utils/auth_api";
  import { refreshAuth } from "$/utils/auth_session";
  import { navigateApp } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  let email = $state("");
  let name = $state("");
  let password = $state("");
  let confirm = $state("");
  let configureSmtp = $state(false);
  let smtpHost = $state("");
  let smtpPort = $state("587");
  let smtpSecure = $state(false);
  let smtpUser = $state("");
  let smtpPass = $state("");
  let smtpFrom = $state("");
  let busy = $state(false);
  let error = $state("");

  const submit = async () => {
    if (password.length < 8 || password !== confirm) {
      error = $tr("auth.password.rules");
      return;
    }
    busy = true;
    error = "";
    try {
      await setupAuth({
        email,
        name,
        password,
        smtp: configureSmtp
          ? {
              host: smtpHost,
              port: Number(smtpPort || 587),
              secure: smtpSecure,
              user: smtpUser,
              pass: smtpPass,
              from: smtpFrom || email,
            }
          : undefined,
      });
      await refreshAuth();
      navigateApp({ name: "library", section: "recent" }, "replace");
    } catch {
      error = $tr("auth.setup.failed");
    } finally {
      busy = false;
    }
  };
</script>

<AuthLayout title={$tr("auth.setup.title")} lead={$tr("auth.setup.lead")}>
  <form
    class="auth-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}>
    <label>
      <span>{$tr("auth.name")}</span>
      <TextField autocomplete="name" bind:value={name} />
    </label>
    <label>
      <span>{$tr("auth.email")}</span>
      <TextField type="email" autocomplete="username" bind:value={email} />
    </label>
    <label>
      <span>{$tr("auth.password")}</span>
      <TextField type="password" autocomplete="new-password" bind:value={password} />
    </label>
    <label>
      <span>{$tr("auth.password.confirm")}</span>
      <TextField type="password" autocomplete="new-password" bind:value={confirm} />
    </label>
    <label class="auth-check">
      <input type="checkbox" bind:checked={configureSmtp} />
      {$tr("auth.setup.smtp.toggle")}
    </label>
    {#if configureSmtp}
      <label>
        <span>{$tr("auth.smtp.host")}</span>
        <TextField autocomplete="off" bind:value={smtpHost} />
      </label>
      <label>
        <span>{$tr("auth.smtp.port")}</span>
        <TextField type="number" bind:value={smtpPort} />
      </label>
      <label class="auth-check">
        <input type="checkbox" bind:checked={smtpSecure} />
        {$tr("auth.smtp.secure")}
      </label>
      <label>
        <span>{$tr("auth.smtp.user")}</span>
        <TextField autocomplete="off" bind:value={smtpUser} />
      </label>
      <label>
        <span>{$tr("auth.smtp.pass")}</span>
        <TextField type="password" autocomplete="new-password" bind:value={smtpPass} />
      </label>
      <label>
        <span>{$tr("auth.smtp.from")}</span>
        <TextField type="email" bind:value={smtpFrom} />
      </label>
    {/if}
    {#if error}
      <p class="auth-error">{error}</p>
    {/if}
    <Button variant="primary" type="submit" disabled={busy || !email.trim() || !password}>
      {busy ? $tr("auth.setup.busy") : $tr("auth.setup.action")}
    </Button>
  </form>
</AuthLayout>
