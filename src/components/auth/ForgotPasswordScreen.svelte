<script lang="ts">
  import AuthLayout from "$/components/auth/AuthLayout.svelte";
  import { Button, TextField } from "$/components/ui";
  import { requestPasswordReset } from "$/utils/auth_api";
  import { loginHref } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  let email = $state("");
  let busy = $state(false);
  let sent = $state(false);

  const submit = async () => {
    busy = true;
    try {
      await requestPasswordReset(email);
      sent = true;
    } finally {
      busy = false;
    }
  };
</script>

<AuthLayout title={$tr("auth.forgot.title")} lead={$tr("auth.forgot.lead")}>
  {#if sent}
    <p class="auth-note">{$tr("auth.forgot.sent")}</p>
  {:else}
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
      <Button variant="primary" type="submit" disabled={busy || !email.trim()}>
        {busy ? $tr("auth.forgot.busy") : $tr("auth.forgot.action")}
      </Button>
    </form>
  {/if}

  {#snippet footer()}
    <a href={loginHref()}>{$tr("auth.back_to_login")}</a>
  {/snippet}
</AuthLayout>
