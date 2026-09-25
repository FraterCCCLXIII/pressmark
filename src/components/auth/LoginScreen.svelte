<script lang="ts">
  import AuthLayout from "$/components/auth/AuthLayout.svelte";
  import { Button, TextField } from "$/components/ui";
  import { loginAuth } from "$/utils/auth_api";
  import { refreshAuth } from "$/utils/auth_session";
  import { forgotHref, navigateApp } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  let email = $state("");
  let password = $state("");
  let busy = $state(false);
  let error = $state("");

  const submit = async () => {
    busy = true;
    error = "";
    try {
      await loginAuth(email, password);
      await refreshAuth();
      navigateApp({ name: "library", section: "recent" }, "replace");
    } catch {
      error = $tr("auth.login.invalid");
    } finally {
      busy = false;
    }
  };
</script>

<AuthLayout title={$tr("auth.login.title")} lead={$tr("auth.login.lead")}>
  <form
    class="auth-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}>
    <label>
      <span>{$tr("auth.email")}</span>
      <TextField type="email" autocomplete="username" bind:value={email} />
    </label>
    <label>
      <span>{$tr("auth.password")}</span>
      <TextField type="password" autocomplete="current-password" bind:value={password} />
    </label>
    {#if error}
      <p class="auth-error">{error}</p>
    {/if}
    <Button variant="primary" type="submit" disabled={busy || !email.trim() || !password}>
      {busy ? $tr("auth.login.busy") : $tr("auth.login.action")}
    </Button>
  </form>

  {#snippet footer()}
    <a href={forgotHref()}>{$tr("auth.forgot.link")}</a>
  {/snippet}
</AuthLayout>
