<script lang="ts">
  import { onMount } from "svelte";
  import MainPage from "$/components/MainPage.svelte";
  import AdminScreen from "$/components/auth/AdminScreen.svelte";
  import ForgotPasswordScreen from "$/components/auth/ForgotPasswordScreen.svelte";
  import LoginScreen from "$/components/auth/LoginScreen.svelte";
  import ResetPasswordScreen from "$/components/auth/ResetPasswordScreen.svelte";
  import SetupScreen from "$/components/auth/SetupScreen.svelte";
  import {
    isAuthRoute,
    navigateApp,
    parseAppRoute,
    subscribeAppRoute,
    type AppRoute,
  } from "$/utils/app_router";
  import { auth, refreshAuth } from "$/utils/auth_session";

  let route = $state<AppRoute | null>(parseAppRoute());

  const publicAuthName = (value: AppRoute | null) =>
    value?.name === "login" || value?.name === "forgot" || value?.name === "reset";

  $effect(() => {
    if (!$auth.ready) {
      return;
    }
    const current = route;

    if ($auth.setupRequired && current?.name !== "setup") {
      navigateApp({ name: "setup" }, "replace");
      return;
    }

    if ($auth.authEnabled && !$auth.user && !publicAuthName(current) && current?.name !== "setup") {
      navigateApp({ name: "login" }, "replace");
      return;
    }

    if ($auth.user && isAuthRoute(current) && current.name !== "admin") {
      navigateApp({ name: "library", section: "recent" }, "replace");
      return;
    }

    if (current?.name === "admin" && $auth.user?.role !== "admin") {
      navigateApp({ name: "library", section: "recent" }, "replace");
      return;
    }

    if (!$auth.authEnabled && !$auth.setupRequired && publicAuthName(current)) {
      navigateApp({ name: "library", section: "recent" }, "replace");
    }
  });

  onMount(() => {
    void refreshAuth();
    return subscribeAppRoute((next) => {
      route = next;
    });
  });
</script>

{#if !$auth.ready}
  <div class="auth-boot">
    <p>Pressmark</p>
  </div>
{:else if $auth.setupRequired || (route?.name === "setup" && $auth.canSetup)}
  <SetupScreen />
{:else if $auth.authEnabled && !$auth.user}
  {#if route?.name === "forgot"}
    <ForgotPasswordScreen />
  {:else if route?.name === "reset"}
    <ResetPasswordScreen token={route.token} />
  {:else}
    <LoginScreen />
  {/if}
{:else}
  <MainPage />
  {#if route?.name === "admin" && $auth.user?.role === "admin"}
    <AdminScreen />
  {/if}
{/if}

<style>
  .auth-boot {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ws-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
