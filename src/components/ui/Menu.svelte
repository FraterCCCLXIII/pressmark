<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { createPopper, type Instance } from "@popperjs/core";
  import { cn } from "$/utils/cn";

  interface Props {
    open?: boolean;
    align?: "start" | "end";
    side?: "top" | "bottom";
    closeOnSelect?: boolean;
    class?: string;
    triggerClass?: string;
    onOpen?: () => void;
    trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
    children: Snippet;
  }

  let {
    open = $bindable(false),
    align = "end",
    side = "bottom",
    closeOnSelect = true,
    class: className,
    triggerClass,
    onOpen,
    trigger,
    children,
  }: Props = $props();

  let triggerEl: HTMLElement | undefined = $state();
  let menuEl: HTMLElement | undefined = $state();
  let popper: Instance | undefined;

  const toggle = () => {
    open = !open;
  };

  export const show = () => {
    open = true;
  };

  export const hide = () => {
    open = false;
  };

  const onDocumentPointer = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (triggerEl?.contains(target) || menuEl?.contains(target)) {
      return;
    }
    open = false;
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      open = false;
    }
  };

  $effect(() => {
    if (!open || !triggerEl || !menuEl) {
      popper?.destroy();
      popper = undefined;
      return;
    }
    onOpen?.();

    popper = createPopper(triggerEl, menuEl, {
      placement: `${side}-${align === "end" ? "end" : "start"}`,
      strategy: "fixed",
      modifiers: [
        { name: "offset", options: { offset: [0, 4] } },
        { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
      ],
    });

    document.addEventListener("pointerdown", onDocumentPointer);
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointer);
      document.removeEventListener("keydown", onKeydown);
      popper?.destroy();
      popper = undefined;
    };
  });

  onDestroy(() => {
    popper?.destroy();
  });
</script>

<div class={cn("relative inline-flex", triggerClass)} bind:this={triggerEl}>
  {@render trigger({ toggle, open })}
</div>

{#if open}
  <div
    bind:this={menuEl}
    class={cn("z-[1080] min-w-44 rounded-xl border border-line bg-surface p-1.5 text-xs text-foreground shadow-ws", className)}
    role="menu"
    tabindex="-1"
    onclick={(event) => {
      if (!closeOnSelect) {
        return;
      }
      const item = (event.target as HTMLElement).closest("button");
      if (item && !item.disabled) {
        open = false;
      }
    }}
    onkeydown={(event) => {
      if (event.key === "Escape") {
        open = false;
      }
    }}>
    {@render children()}
  </div>
{/if}
