<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    lead?: string;
    children: Snippet;
    footer?: Snippet;
  }

  let { title, lead, children, footer }: Props = $props();
</script>

<div class="auth-screen">
  <div class="auth-card">
    <p class="auth-brand">Pressmark</p>
    <h1>{title}</h1>
    {#if lead}
      <p class="auth-lead">{lead}</p>
    {/if}
    {@render children()}
    {#if footer}
      <div class="auth-footer">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>

<style>
  .auth-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    background: var(--ws-bg, #f6f6f6);
  }

  .auth-card {
    width: min(440px, 100%);
    padding: 28px;
    border: 1px solid var(--ws-line);
    border-radius: 16px;
    background: var(--ws-surface);
    box-shadow: var(--ws-shadow);
  }

  .auth-brand {
    margin: 0 0 8px;
    color: var(--ws-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 600;
  }

  .auth-lead,
  .auth-footer {
    color: var(--ws-muted);
    font-size: 14px;
  }

  .auth-lead {
    margin: 0 0 20px;
  }

  .auth-footer {
    margin-top: 16px;
  }

  .auth-footer :global(a) {
    color: var(--ws-accent);
    text-decoration: none;
  }

  :global(.auth-form) {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  :global(.auth-form label),
  :global(.auth-form .auth-check) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }

  :global(.auth-form .auth-check) {
    flex-direction: row;
    align-items: center;
  }

  :global(.auth-error) {
    margin: 0;
    color: var(--color-danger);
    font-size: 13px;
  }

  :global(.auth-note) {
    margin: 0;
    color: var(--ws-muted);
    font-size: 14px;
  }
</style>
