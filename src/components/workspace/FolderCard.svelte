<script lang="ts">
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Menu, MenuItem } from "$/components/ui";
  import { isLibraryDrag } from "$/utils/library_dnd";
  import { tr } from "$/utils/i18n";

  interface Props {
    name: string;
    href: string;
    itemCount?: number;
    onDragStart?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
    onOpen?: () => void;
    onRename?: () => void;
    onNewSubfolder?: () => void;
    onDelete?: () => void;
  }

  let { name, href, itemCount = 0, onDragStart, onDrop, onOpen, onRename, onNewSubfolder, onDelete }: Props = $props();

  let menu: { show: () => void } | undefined = $state();
  let dropping = $state(false);

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
    onOpen?.();
  };
</script>

<div
  class="template-card-wrap"
  draggable="true"
  role="listitem"
  ondragstart={onDragStart}
  ondragover={(event) => {
    if (!event.dataTransfer || !isLibraryDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dropping = true;
  }}
  ondragleave={() => (dropping = false)}
  ondrop={(event) => {
    dropping = false;
    onDrop?.(event);
  }}>
  <div class="template-card" class:is-drop={dropping}>
    <a class="template-card__hit" {href} onclick={onCardClick} oncontextmenu={showCardMenu}>
      <div class="template-card__preview">
        <span class="folder-card__icon">
          <MdIcon icon="folder" />
        </span>
      </div>
      <div class="template-card__meta">
        <div class="min-w-0">
          <div class="template-card__title">{name}</div>
          <div class="template-card__size">{itemCount} {$tr("library.folder.items")}</div>
        </div>
      </div>
    </a>

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
        {#if onNewSubfolder}
          <MenuItem onclick={onNewSubfolder}>{$tr("library.folder.new_sub")}</MenuItem>
        {/if}
        {#if onRename}
          <MenuItem onclick={onRename}>{$tr("library.rename")}</MenuItem>
        {/if}
        {#if onDelete}
          <div class="my-1 h-px bg-line"></div>
          <MenuItem danger onclick={onDelete}>{$tr("library.delete")}</MenuItem>
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

  .template-card.is-drop {
    outline: 1px solid var(--ws-accent);
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
    text-decoration: none;
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

  .folder-card__icon {
    color: var(--ws-muted, #8b8b8b);
  }

  .folder-card__icon :global(.app-icon svg) {
    width: 40px;
    height: 40px;
  }
</style>
