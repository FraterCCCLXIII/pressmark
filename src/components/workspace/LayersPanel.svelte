<script lang="ts">
  import type { FabricObject } from "fabric";
  import CustomScroll from "$/components/basic/CustomScroll.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Menu, MenuItem } from "$/components/ui";
  import { tr } from "$/utils/i18n";
  import {
    getLayerIcon,
    type DesignerLayer,
    type LayerKind,
  } from "$/utils/canvas_layers";

  interface Props {
    layers: DesignerLayer[];
    onSelect: (obj: FabricObject) => void;
    onReorder: (fromIndex: number, insertBefore: number) => void;
    onClone: (obj: FabricObject) => void;
    onDelete: (obj: FabricObject) => void;
    onBringToFront: (obj: FabricObject) => void;
    onSendToBack: (obj: FabricObject) => void;
  }

  let { layers, onSelect, onReorder, onClone, onDelete, onBringToFront, onSendToBack }: Props = $props();

  let listEl: HTMLElement | undefined = $state();
  let draggingKey = $state<string | null>(null);
  let dropIndex = $state<number | null>(null);
  const layerMenus: Record<string, { show: () => void } | undefined> = $state({});

  const kindLabel = (kind: LayerKind): string => {
    if (kind === "text") return $tr("editor.objectpicker.text");
    if (kind === "image") return $tr("editor.objectpicker.image");
    if (kind === "barcode") return $tr("editor.objectpicker.barcode");
    if (kind === "qrcode") return $tr("editor.objectpicker.qrcode");
    if (kind === "aruco") return $tr("editor.objectpicker.aruco");
    if (kind === "line") return $tr("editor.objectpicker.line");
    if (kind === "circle") return $tr("editor.elements.figure");
    if (kind === "rectangle") return $tr("editor.elements.border");
    if (kind === "icon") return $tr("editor.elements.icon");
    return $tr("editor.layers.group");
  };

  const rowLabel = (layer: DesignerLayer) => layer.preview || kindLabel(layer.kind);

  const dropIndexAt = (clientY: number): number => {
    if (!listEl) {
      return 0;
    }
    const rows = [...listEl.querySelectorAll<HTMLElement>("[data-layer]")];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return i;
      }
    }
    return rows.length;
  };

  const showLayerMenu = (event: Event, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    layerMenus[layers[index].key]?.show();
  };

  const onRowPointerDown = (event: PointerEvent, index: number) => {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest("[data-layer-more-wrap]")) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      showLayerMenu(event, index);
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    const key = layers[index].key;

    const onMove = (moveEvent: PointerEvent) => {
      if (!started) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) {
          return;
        }
        started = true;
        draggingKey = key;
        dropIndex = index;
        try {
          target.setPointerCapture(moveEvent.pointerId);
        } catch {
          // Capture can fail for synthetic events; window listeners still track the drag.
        }
      }
      dropIndex = dropIndexAt(moveEvent.clientY);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (started && dropIndex != null) {
        onReorder(index, dropIndex);
      } else if (!started) {
        onSelect(layers[index].object);
      }
      draggingKey = null;
      dropIndex = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onRowKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(layers[index].object);
      return;
    }
    if (!event.altKey) {
      return;
    }
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onReorder(index, index - 1);
    }
    if (event.key === "ArrowDown" && index < layers.length - 1) {
      event.preventDefault();
      onReorder(index, index + 2);
    }
  };
</script>

<section class="layers-panel">
  <h3>{$tr("editor.layers")}</h3>
  <CustomScroll class="layers-panel__scroll">
    {#if layers.length === 0}
      <p class="layers-panel__empty">{$tr("editor.layers.empty")}</p>
    {:else}
      <div
        bind:this={listEl}
        class="layers-list"
        class:is-dragging={draggingKey != null}
        role="listbox"
        aria-label={$tr("editor.layers")}
        aria-describedby="layers-drag-hint">
        <span id="layers-drag-hint" class="sr-only">{$tr("editor.layers.drag")}</span>
        {#each layers as layer, index (layer.key)}
          <div
            data-layer
            data-layer-index={index}
            class="layer-row"
            class:is-selected={layer.selected}
            class:is-dragging={draggingKey === layer.key}
            class:is-drop-before={dropIndex === index}
            class:is-drop-after={index === layers.length - 1 && dropIndex === layers.length}
            role="option"
            aria-selected={layer.selected}
            tabindex="0"
            title={rowLabel(layer)}
            onpointerdown={(event) => onRowPointerDown(event, index)}
            oncontextmenu={(event) => showLayerMenu(event, index)}
            onkeydown={(event) => onRowKeyDown(event, index)}>
            <span class="layer-row__icon" aria-hidden="true">
              <MdIcon icon={getLayerIcon(layer.kind)} />
            </span>
            <span class="layer-row__label">{rowLabel(layer)}</span>
            <div class="layer-row__more" data-layer-more-wrap>
              <Menu bind:this={layerMenus[layer.key]}>
                {#snippet trigger({ toggle })}
                  <button
                    type="button"
                    class="layer-row__more-btn"
                    data-layer-more
                    title={$tr("editor.more")}
                    aria-label={$tr("editor.more")}
                    onpointerdown={(event) => event.stopPropagation()}
                    onclick={(event) => {
                      event.stopPropagation();
                      toggle();
                    }}>
                    <MdIcon icon="more_horiz" />
                  </button>
                {/snippet}
                <MenuItem onclick={() => onBringToFront(layer.object)}>
                  {$tr("params.generic.arrange.top")}
                </MenuItem>
                <MenuItem onclick={() => onSendToBack(layer.object)}>
                  {$tr("params.generic.arrange.bottom")}
                </MenuItem>
                <MenuItem onclick={() => onClone(layer.object)}>
                  {$tr("editor.clone")}
                </MenuItem>
                <div class="my-1 h-px bg-line"></div>
                <MenuItem danger onclick={() => onDelete(layer.object)}>
                  {$tr("editor.delete")}
                </MenuItem>
              </Menu>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </CustomScroll>
</section>

<style>
  .layers-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    padding-top: 12px;
    border-top: 1px solid var(--ws-line);
  }

  .layers-panel h3 {
    padding: 0 16px;
  }

  .layers-panel :global(.layers-panel__scroll) {
    flex: 1;
    min-height: 0;
  }

  .layers-panel :global(.layers-panel__scroll .ws-scroll__view) {
    padding: 0 8px 12px;
  }

  .layers-panel__empty {
    margin: 0;
    padding: 8px;
    color: var(--ws-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .layers-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    user-select: none;
  }

  .layers-list.is-dragging {
    cursor: grabbing;
  }

  .layer-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 4px 8px;
    border-radius: var(--ws-radius-sm);
    color: var(--ws-text);
    cursor: grab;
    touch-action: none;
  }

  .layer-row:hover {
    background: var(--ws-hover);
  }

  .layer-row.is-selected {
    background: var(--ws-active);
  }

  .layer-row.is-dragging {
    opacity: 0.45;
    cursor: grabbing;
  }

  .layer-row.is-drop-before::before,
  .layer-row.is-drop-after::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--ws-accent);
    pointer-events: none;
  }

  .layer-row.is-drop-before::before {
    top: -1px;
  }

  .layer-row.is-drop-after::after {
    bottom: -1px;
  }

  .layer-row__icon {
    display: inline-flex;
    color: #4a4a4a;
    flex-shrink: 0;
  }

  .layer-row__label {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .layer-row__more {
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    pointer-events: none;
  }

  .layer-row:hover .layer-row__more,
  .layer-row:focus-within .layer-row__more,
  .layer-row__more:has(:global(.show)) {
    opacity: 1;
    pointer-events: auto;
  }

  .layer-row__more-btn {
    appearance: none;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ws-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .layer-row__more-btn:hover,
  .layer-row__more-btn:focus-visible,
  .layer-row__more-btn:global(.show) {
    background: var(--ws-surface);
    color: var(--ws-text);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
