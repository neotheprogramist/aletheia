<script lang="ts">
	import '../app.css';
	import AppLoader from '$lib/ui/AppLoader.svelte';
	import Navbar from '$lib/ui/Navbar.svelte';
	import Toasts from '$lib/ui/Toasts.svelte';
	import { initI18n } from '$lib/i18n';
	import { onMount } from 'svelte';

	onMount(() => {
		initI18n();
	});
</script>

<AppLoader>
	<header><Navbar /></header>
	<main class="content"><slot /></main>
	<Toasts />
</AppLoader>
