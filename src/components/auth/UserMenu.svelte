<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button, Menu, MenuItem, TextField } from "$/components/ui";
  import { changePassword, type AuthUser } from "$/utils/auth_api";
  import { signOut } from "$/utils/auth_session";
  import { navigateApp } from "$/utils/app_router";
  import { tr } from "$/utils/i18n";

  interface Props {
    user: AuthUser;
  }

  let { user }: Props = $props();
  let passwordOpen = $state(false);
  let currentPassword = $state("");
  let password = $state("");
  let confirm = $state("");
  let busy = $state(false);
  let error = $state("");

  const submitPassword = async () => {
    if (password.length < 8 || password !== confirm) {
      error = $tr("auth.password.rules");
      return;
    }
    busy = true;
    error = "";
    try {
      await changePassword(currentPassword, password);
      passwordOpen = false;
      currentPassword = "";
      password = "";
      confirm = "";
    } catch {
      error = $tr("auth.password.invalid");
    } finally {
      busy = false;
    }
  };
</script>

<Menu side="top" align="start" triggerClass="w-full">
  {#snippet trigger({ toggle })}
    <button type="button" class="library-nav__item library-nav__account-btn" onclick={toggle}>
      <MdIcon icon="person" />
      <span class="library-nav__account-name">{user.name || user.email}</span>
    </button>
  {/snippet}
  <div class="px-3 py-2">
    <div class="text-sm font-medium">{user.name || user.email}</div>
    <div class="text-muted">{user.email}</div>
  </div>
  {#if user.role === "admin"}
    <MenuItem onclick={() => navigateApp({ name: "admin" })}>
      <MdIcon icon="settings" />
      {$tr("auth.admin.title")}
    </MenuItem>
  {/if}
  <MenuItem
    onclick={() => {
      passwordOpen = true;
      error = "";
    }}>
    <MdIcon icon="lock" />
    {$tr("auth.password.change")}
  </MenuItem>
  <MenuItem
    onclick={() => {
      void signOut().then(() => navigateApp({ name: "login" }, "replace"));
    }}>
    <MdIcon icon="logout" />
    {$tr("auth.logout")}
  </MenuItem>
</Menu>

{#if passwordOpen}
  <AppModal bind:show={passwordOpen} title={$tr("auth.password.change")}>
    <form
      class="auth-form"
      onsubmit={(event) => {
        event.preventDefault();
        void submitPassword();
      }}>
      <label>
        <span>{$tr("auth.password.current")}</span>
        <TextField type="password" autocomplete="current-password" bind:value={currentPassword} />
      </label>
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
    </form>
    {#snippet footer()}
      <Button onclick={() => (passwordOpen = false)}>{$tr("params.csv.cancel")}</Button>
      <Button variant="primary" onclick={() => void submitPassword()} disabled={busy}>
        {busy ? $tr("auth.password.busy") : $tr("editor.save")}
      </Button>
    {/snippet}
  </AppModal>
{/if}
