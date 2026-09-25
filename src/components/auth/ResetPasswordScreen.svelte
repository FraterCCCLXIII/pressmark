<script lang="ts">
  import AuthLayout from "$/components/auth/AuthLayout.svelte";
  import { Button, TextField } from "$/components/ui";
  import { resetPassword } from "$/utils/auth_api";
  import { refreshAuth } from "$/utils/auth_session";
  import { loginHref, navigateApp } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  interface Props {
    token: string;
  }

  let { token }: Props = $props();
  let password = $state("");
  let confirm = $state("");
  let busy = $state(false);
  let error = $state("");

  const submit = async () => {
    if (password !== confirm || password.length < 8) {
      error = $tr("auth.password.rules");
      return;
    }
    busy = true;
    error = "";
    try {
      await resetPassword(token, password);
      await refreshAuth();
      navigateApp({ name: "library", section: "recent" }, "replace");
    } catch {
      error = $tr("auth.reset.invalid");
    } finally {
      busy = false;
    }
  };
</script>

<AuthLayout title={$tr("auth.reset.title")} lead={$tr("auth.reset.lead")}>
  <form
    class="auth-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}>
    <label>
      <span>{$tr("auth.password.new")}</span>
      <TextField type="password" autocomplete="new-password" bind:value={password} />
    </label>
    <label>
      <span>{$tr("auth.password.confirm")}</span>
      <TextField type="password" autocomplete="new-password" bind:value={confirm} />
    </label>
    {#if error}
      <p class="auth-error">{error}</p>
    {/if}
    <Button variant="primary" type="submit" disabled={busy || !password || !confirm}>
      {busy ? $tr("auth.reset.busy") : $tr("auth.reset.action")}
    </Button>
  </form>

  {#snippet footer()}
    <a href={loginHref()}>{$tr("auth.back_to_login")}</a>
  {/snippet}
</AuthLayout>
