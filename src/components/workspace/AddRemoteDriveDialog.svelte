<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import { Button, TextField } from "$/components/ui";
  import { probePressmarkHost, fetchRemoteLibrary, RemoteLibraryError } from "$/utils/library_remote";
  import { createDriveId, normalizeOrigin, type RemoteDrive } from "$/utils/library_tree";
  import { tr } from "$/utils/i18n";

  interface Props {
    show: boolean;
    onAdd: (drive: RemoteDrive) => void;
  }

  let { show = $bindable(), onAdd }: Props = $props();

  let name = $state("");
  let origin = $state("");
  let token = $state("");
  let busy = $state(false);
  let error = $state("");

  $effect.pre(() => {
    if (show) {
      name = "";
      origin = "";
      token = "";
      busy = false;
      error = "";
    }
  });

  const connect = async () => {
    const nextOrigin = normalizeOrigin(origin);
    const nextToken = token.trim().toUpperCase();
    if (!nextOrigin || !nextToken) {
      return;
    }
    busy = true;
    error = "";
    try {
      const info = await probePressmarkHost(nextOrigin);
      if (!info.sharing) {
        throw new RemoteLibraryError($tr("library.drive.not_sharing"));
      }
      await fetchRemoteLibrary(nextOrigin, nextToken);
      onAdd({
        id: createDriveId(),
        name: name.trim() || info.name || $tr("library.drive.default_name"),
        origin: nextOrigin,
        token: nextToken,
      });
      show = false;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : $tr("library.drive.connect_failed");
    } finally {
      busy = false;
    }
  };
</script>

{#if show}
  <AppModal bind:show title={$tr("library.drive.add")}>
    <p class="drive-help">{$tr("library.drive.help")}</p>
    <label class="drive-field">
      <span>{$tr("library.drive.address")}</span>
      <TextField bind:value={origin} placeholder="http://localhost:5173" autocomplete="off" />
    </label>
    <label class="drive-field">
      <span>{$tr("library.drive.code")}</span>
      <TextField bind:value={token} placeholder="ABCD2345" autocomplete="off" />
    </label>
    <label class="drive-field">
      <span>{$tr("library.drive.name")}</span>
      <TextField bind:value={name} placeholder={$tr("library.drive.default_name")} />
    </label>
    {#if error}
      <p class="drive-error">{error}</p>
    {/if}

    {#snippet footer()}
      <Button variant="primary" onclick={connect} disabled={busy || !origin.trim() || !token.trim()}>
        {busy ? $tr("library.drive.connecting") : $tr("library.drive.connect")}
      </Button>
    {/snippet}
  </AppModal>
{/if}

<style>
  .drive-help,
  .drive-error {
    margin: 0 0 12px;
    font-size: 13px;
  }

  .drive-help {
    color: var(--ws-muted);
  }

  .drive-error {
    color: #c0392b;
  }

  .drive-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .drive-field span {
    color: var(--ws-muted);
    font-size: 12px;
  }
</style>
