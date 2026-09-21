<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import { get } from "svelte/store";
  import { Button } from "$/components/ui";
  import { tr } from "$/utils/i18n";

  interface Props {
    show: boolean;
    value: string;
    title?: string;
    fieldLabel?: string;
    actionLabel?: string;
    onRename: (name: string) => void;
  }

  let { show = $bindable(), value, title, fieldLabel, actionLabel, onRename }: Props = $props();

  let draft = $state("");
  let nameInput: HTMLInputElement | undefined = $state();

  const seedName = (raw: string) => raw.trim() || get(tr)("editor.untitled");

  $effect.pre(() => {
    if (show) {
      draft = seedName(value);
    }
  });

  $effect(() => {
    if (!show || !nameInput) {
      return;
    }
    const input = nameInput;
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });

  const confirm = () => {
    const next = draft.trim();
    if (!next) {
      return;
    }
    onRename(next);
    show = false;
  };
</script>

{#if show}
  <AppModal bind:show title={title ?? $tr("editor.rename.title")}>
    <label class="rename-field">
      <span>{fieldLabel ?? $tr("editor.label_settings.title")}</span>
      <input
        bind:this={nameInput}
        class="insp-field"
        type="text"
        maxlength="80"
        placeholder={$tr("editor.rename.placeholder")}
        bind:value={draft}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          }
        }} />
    </label>

    {#snippet footer()}
      <Button variant="primary" onclick={confirm} disabled={!draft.trim()}>
        {actionLabel ?? $tr("editor.rename.action")}
      </Button>
    {/snippet}
  </AppModal>
{/if}

<style>
  .rename-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rename-field span {
    color: var(--ws-muted, #8b8b8b);
    font-size: 12px;
  }
</style>
