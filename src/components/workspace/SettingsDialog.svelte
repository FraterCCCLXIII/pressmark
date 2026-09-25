<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button, TextField } from "$/components/ui";
  import { locale, locales, tr } from "$/utils/i18n";
  import { generateAccessCode, loadLibraryShare, saveLibraryShare } from "$/utils/library_store";
  import { setLibrarySharing } from "$/utils/library_share";
  import { auth } from "$/utils/auth_session";
  import { adminHref, setupHref } from "$/utils/app_router";

  interface Props {
    show: boolean;
    commit?: string;
    buildDate?: string;
    onDebug: () => void;
  }

  let { show = $bindable(), commit, buildDate, onDebug }: Props = $props();

  let share = $state(loadLibraryShare());
  let copied = $state<"address" | "code" | null>(null);

  $effect(() => {
    if (show) {
      share = loadLibraryShare();
      copied = null;
    }
  });

  const address = $derived(typeof window === "undefined" ? "" : window.location.origin);

  const persistShare = () => {
    saveLibraryShare(share);
  };

  const toggleShare = async (enabled: boolean) => {
    share = { ...share, enabled };
    persistShare();
    await setLibrarySharing(enabled);
    share = loadLibraryShare();
  };

  const copy = async (kind: "address" | "code", value: string) => {
    await navigator.clipboard.writeText(value);
    copied = kind;
  };

  const rotateCode = async () => {
    share = { ...share, token: generateAccessCode() };
    persistShare();
    if (share.enabled) {
      await setLibrarySharing(true);
    }
  };
</script>

{#if show}
  <AppModal bind:show title={$tr("settings.title")}>
    <section class="settings-block">
      <h3>{$tr("settings.language")}</h3>
      <select class="insp-field insp-select" bind:value={$locale}>
        {#each Object.entries(locales) as [key, name] (key)}
          <option value={key}>{name}</option>
        {/each}
      </select>
    </section>

    <section class="settings-block">
      <h3>{$tr("library.share.title")}</h3>
      <p class="settings-help">{$tr("library.share.help")}</p>
      <label class="settings-toggle">
        <input
          type="checkbox"
          checked={share.enabled}
          onchange={(event) => void toggleShare(event.currentTarget.checked)} />
        {$tr("library.share.enable")}
      </label>
      <label class="settings-field">
        <span>{$tr("library.share.name")}</span>
        <TextField
          value={share.name}
          oninput={(event) => {
            share = { ...share, name: event.currentTarget.value };
            persistShare();
          }} />
      </label>
      <div class="settings-copy-row">
        <div>
          <span>{$tr("library.drive.address")}</span>
          <code>{address}</code>
        </div>
        <Button size="sm" onclick={() => void copy("address", address)}>
          {copied === "address" ? $tr("library.share.copied") : $tr("library.share.copy")}
        </Button>
      </div>
      <div class="settings-copy-row">
        <div>
          <span>{$tr("library.drive.code")}</span>
          <code>{share.token}</code>
        </div>
        <div class="settings-copy-actions">
          <Button size="sm" onclick={() => void copy("code", share.token)}>
            {copied === "code" ? $tr("library.share.copied") : $tr("library.share.copy")}
          </Button>
          <Button size="sm" onclick={() => void rotateCode()}>{$tr("library.share.new_code")}</Button>
        </div>
      </div>
    </section>

    {#if $auth.canSetup || $auth.authEnabled}
      <section class="settings-block">
        <h3>{$tr("auth.settings.title")}</h3>
        <p class="settings-help">
          {$auth.authEnabled ? $tr("auth.settings.enabled") : $tr("auth.settings.help")}
        </p>
        {#if $auth.canSetup}
          <a class="settings-debug" href={setupHref()}>{$tr("auth.setup.action")}</a>
        {:else if $auth.user?.role === "admin"}
          <a class="settings-debug" href={adminHref()}>{$tr("auth.admin.title")}</a>
        {/if}
      </section>
    {/if}

    <section class="settings-block">
      <h3>{$tr("settings.about")}</h3>
      <dl class="settings-meta">
        <div>
          <dt>{$tr("settings.app")}</dt>
          <dd>Pressmark</dd>
        </div>
        {#if commit}
          <div>
            <dt>{$tr("settings.commit")}</dt>
            <dd>
              <a href="https://github.com/FraterCCCLXIII/pressmark/commit/{commit}" target="_blank" rel="noreferrer">
                {commit.slice(0, 7)}
              </a>
            </dd>
          </div>
        {/if}
        {#if buildDate}
          <div>
            <dt>{$tr("main.built")}</dt>
            <dd>{buildDate}</dd>
          </div>
        {/if}
        <div>
          <dt>{$tr("main.code")}</dt>
          <dd>
            <a href="https://github.com/FraterCCCLXIII/pressmark" target="_blank" rel="noreferrer">GitHub</a>
          </dd>
        </div>
      </dl>
    </section>

    <section class="settings-block">
      <button type="button" class="settings-debug" onclick={onDebug}>
        <MdIcon icon="bug_report" />
        {$tr("settings.debug")}
      </button>
    </section>
  </AppModal>
{/if}

<style>
  .settings-block {
    margin-bottom: 20px;
  }

  .settings-block:last-child {
    margin-bottom: 0;
  }

  .settings-block h3 {
    margin: 0 0 8px;
    color: var(--ws-text);
    font-size: 14px;
    font-weight: 600;
  }

  .settings-help {
    margin: 0 0 12px;
    color: var(--ws-muted);
    font-size: 13px;
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--ws-text);
    font-size: 14px;
  }

  .settings-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .settings-field span,
  .settings-copy-row span {
    color: var(--ws-muted);
    font-size: 12px;
  }

  .settings-copy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .settings-copy-row code {
    display: block;
    margin-top: 4px;
    color: var(--ws-text);
    font-size: 13px;
  }

  .settings-copy-actions {
    display: flex;
    gap: 6px;
  }

  .settings-block :global(.insp-field) {
    background: var(--ws-surface);
    color: var(--ws-text);
  }

  .settings-meta {
    display: grid;
    gap: 10px;
    margin: 0;
  }

  .settings-meta div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 14px;
  }

  .settings-meta dt {
    color: var(--ws-muted);
    font-weight: 400;
  }

  .settings-meta dd {
    margin: 0;
    text-align: right;
  }

  .settings-meta a {
    color: inherit;
  }

  .settings-debug {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--ws-line-strong);
    border-radius: 10px;
    background: var(--ws-surface);
    color: var(--ws-text);
    font-size: 14px;
    text-decoration: none;
  }

  .settings-debug:hover {
    background: var(--ws-hover);
  }
</style>
