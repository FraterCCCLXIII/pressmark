<script lang="ts">
  import type { ExportedLabelTemplate } from "$/types";
  import { formatLabelSize } from "$/utils/label_geometry";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import LabelPreview from "$/components/workspace/LabelPreview.svelte";
  import { Menu, MenuItem } from "$/components/ui";

  interface Props {
    label: ExportedLabelTemplate;
    printCount?: number;
    lastQuantity?: number;
    draggable?: boolean;
    onDragStart?: (event: DragEvent) => void;
    onSelect?: () => void;
    onRename?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    onExport?: () => void;
    onPrint?: () => void;
  }

  let {
    label,
    printCount = 0,
    lastQuantity = 0,
    draggable = false,
    onDragStart,
    onSelect,
    onRename,
    onDuplicate,
    onDelete,
    onExport,
    onPrint,
  }: Props = $props();

  let menu: { show: () => void } | undefined = $state();

  const showCardMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    menu?.show();
  };

  const onCardClick = (event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      showCardMenu(event);
      return;
    }
    onSelect?.();
  };
</script>

<div class="template-card-wrap" {draggable} role={draggable ? "listitem" : undefined} ondragstart={onDragStart}>
  <div class="template-card">
    <button type="button" class="template-card__hit" onclick={onCardClick} oncontextmenu={showCardMenu}>
      <div class="template-card__preview">
        <LabelPreview {label} />
      </div>
      <div class="template-card__meta">
        <div class="min-w-0">
          <div class="template-card__title">{label.title ?? $tr("editor.untitled")}</div>
          <div class="template-card__size">{formatLabelSize(label.label)}</div>
        </div>
        {#if printCount > 0}
          <span class="template-card__prints">
            <MdIcon icon="description" />
            {printCount}{lastQuantity > 0 ? `/${lastQuantity}` : ""}
          </span>
        {/if}
      </div>
    </button>

    <div class="template-card__more">
      <Menu bind:this={menu}>
        {#snippet trigger({ toggle })}
          <button
            type="button"
            class="template-card__more-btn"
            title={$tr("editor.more")}
            aria-label={$tr("editor.more")}
            onclick={(event) => {
              event.stopPropagation();
              toggle();
            }}>
            <MdIcon icon="more_horiz" />
          </button>
        {/snippet}
        <MenuItem onclick={() => onSelect?.()}>{$tr("library.open")}</MenuItem>
        {#if onRename}
          <MenuItem onclick={() => onRename()}>{$tr("library.rename")}</MenuItem>
        {/if}
        {#if onDuplicate}
          <MenuItem onclick={() => onDuplicate()}>{$tr("library.duplicate")}</MenuItem>
        {/if}
        {#if onExport}
          <MenuItem onclick={() => onExport()}>{$tr("editor.export")}</MenuItem>
        {/if}
        {#if onPrint}
          <MenuItem onclick={() => onPrint()}>{$tr("editor.print")}</MenuItem>
        {/if}
        {#if onDelete}
          <div class="my-1 h-px bg-line"></div>
          <MenuItem danger onclick={() => onDelete()}>{$tr("library.delete")}</MenuItem>
        {/if}
      </Menu>
    </div>
  </div>
</div>

<style>
  .min-w-0 {
    min-width: 0;
  }

  .template-card-wrap {
    position: relative;
    width: 220px;
    min-width: 220px;
    max-width: 220px;
  }

  .template-card {
    position: relative;
  }

  .template-card__hit {
    appearance: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .template-card__more {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
  }

  .template-card__more-btn {
    appearance: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    color: #6a6a6a;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(17, 17, 17, 0.08);
  }

  .template-card__more-btn:hover {
    background: #fff;
    color: var(--ws-text);
  }
</style>
