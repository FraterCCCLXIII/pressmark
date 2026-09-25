<script lang="ts">
  import { onDestroy, onMount, type Snippet } from "svelte";
  import CustomScroll from "$/components/basic/CustomScroll.svelte";
  import { cn } from "$/utils/cn";

  interface Props {
    show: boolean;
    title: string;
    size?: "md" | "lg" | "xl";
    scroll?: boolean;
    stack?: boolean;
    onClose?: () => boolean | void;
    children: Snippet;
    footer?: Snippet;
  }

  let { show = $bindable(), title, size = "md", scroll = true, stack = false, onClose, children, footer }: Props = $props();

  let modalEl: HTMLDivElement | undefined = $state();
  let dismissReady = $state(false);

  const close = () => {
    if (!dismissReady) {
      return;
    }
    if (onClose?.() === false) {
      return;
    }
    show = false;
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    }
  };

  onMount(() => {
    if (modalEl) {
      document.body.appendChild(modalEl);
    }
    document.addEventListener("keydown", onKeydown);
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      dismissReady = true;
    });
  });

  onDestroy(() => {
    document.removeEventListener("keydown", onKeydown);
    document.body.classList.remove("overflow-hidden");
    modalEl?.remove();
  });

  export const hide = () => {
    close();
  };
</script>

<div
  bind:this={modalEl}
  class={cn("fixed inset-0 z-[1055] flex items-center justify-center p-4", stack && "z-[1070]")}
  role="presentation">
  <button type="button" class="absolute inset-0 bg-black/35" aria-label="Dismiss" onclick={close}></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class={cn(
      "relative flex max-h-[min(90vh,720px)] w-full flex-col overflow-hidden rounded-dialog border border-line bg-surface text-foreground shadow-dialog",
      size === "md" && "max-w-lg",
      size === "lg" && "max-w-[min(960px,calc(100vw-32px))]",
      size === "xl" && "max-w-[min(1100px,calc(100vw-32px))]",
    )}>
    <div class="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
      <h1 class="m-0 text-lg font-semibold text-foreground">{title}</h1>
      <button
        type="button"
        class="inline-flex size-7 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-hover hover:text-foreground"
        aria-label="Dismiss"
        onclick={close}>×</button>
    </div>

    <div class={cn("px-5 py-4", size !== "md" && "pt-3")}>
      {#if scroll}
        <CustomScroll class="workspace-modal__scroll">
          {@render children()}
        </CustomScroll>
      {:else}
        {@render children()}
      {/if}
    </div>

    {#if footer}
      <div class="flex flex-wrap items-center justify-start gap-2 border-t border-line px-5 py-3">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>
