<script lang="ts">
	import { page } from '$app/stores';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import SettingsModal from '$lib/ui/SettingsModal.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, Upload, Menu, X, Settings } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';
	import { t } from '$lib/i18n';

	let fileInput: HTMLInputElement;
	let showMobileMenu = false;
	let showSettings = false;

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
	}

	function toggleSettings() {
		showSettings = !showSettings;
	}

	function closeSettings() {
		showSettings = false;
	}

	async function handleExport() {
		try {
			const json = await exportOperations();
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `operations-backup-${new Date().toISOString()}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			toastStore.addToast({
				type: 'success',
				message: 'Operations successfully exported to JSON.'
			});
		} catch (err) {
			console.error(err);
			toastStore.addToast({
				type: 'error',
				message: 'Failed to export operations.'
			});
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}

	function handleFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		const reader = new FileReader();

		reader.onload = async () => {
			try {
				const text = reader.result as string;
				await importOperations(text);
				toastStore.addToast({
					type: 'success',
					message: 'Operations successfully imported.'
				});
			} catch (err) {
				console.error(err);
				toastStore.addToast({
					type: 'error',
					message: 'Failed to import operations. Ensure the file is valid JSON.'
				});
			} finally {
				input.value = '';
			}
		};

		reader.onerror = () => {
			toastStore.addToast({
				type: 'error',
				message: 'Error reading the file.'
			});
			input.value = '';
		};

		reader.readAsText(file);
	}

	function isActive(path: string) {
		return $page.url.pathname === path;
	}
</script>

<nav class="fixed inset-x-0 top-0 z-10 border-b border-border bg-background backdrop-blur-sm">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<!-- Logo -->
			<a
				href="/"
				class="group flex items-center gap-2 text-lg font-bold tracking-tight text-primary sm:text-xl"
			>
				<div class="relative">
					<img
						src="/logo.svg"
						alt="Privacy Pools"
						class="h-6 w-6 transition-transform duration-200 group-hover:scale-110 sm:h-8 sm:w-8"
					/>
					<div
						class="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full bg-green-400"
					></div>
				</div>
				<span
					class="hidden bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent md:block"
					>Privacy Pools</span
				>
			</a>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-6 xl:flex">
				{#if $isConnected}
					{#each ['/deposit', '/withdraw', '/merge', '/transfer', '/swap'] as route}
						<a
							href="{route}"
							class="transition-all duration-300 ease-in-out px-2 py-2 rounded-lg
								{isActive(route)
									? 'text-primary border-primary scale-110 transform border-b-2 font-bold shadow-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20'
									: 'text-text-secondary hover:text-primary hover:scale-105 hover:font-semibold transform'}"
							aria-current={isActive(route) ? 'page' : undefined}
						>
							{$t(`nav.${route.slice(1)}`)}
						</a>
					{/each}

					<div class="flex items-center gap-2">
						<button
							class="rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
							title="Export all operations to JSON"
							on:click={handleExport}
						>
							<Download size={18} />
						</button>

						<button
							class="rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
							title="Import operations from JSON"
							on:click={openFilePicker}
						>
							<Upload size={18} />
						</button>
					</div>
				{/if}

				<div class="flex items-center gap-3">
					{#if $isConnected}
						<WalletConnector />
					{/if}
					<button
						class="rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
						title="Settings"
						on:click={toggleSettings}
					>
						<Settings size={18} />
					</button>
				</div>
			</div>

			<!-- Mobile menu button -->
			<div class="flex items-center xl:hidden">
				<button
					class="mobile-menu-button rounded-lg p-2 text-text hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
					on:click={toggleMobileMenu}
					aria-label="Toggle mobile menu"
				>
					{#if showMobileMenu}
						<X size={18} />
					{:else}
						<Menu size={18} />
					{/if}
				</button>
			</div>
		</div>

		<!-- Mobile Navigation Menu -->
		{#if showMobileMenu}
			<div class="xl:hidden border-t border-border bg-card">
				<div class="px-2 pt-2 pb-3 space-y-1">
					<div class="flex items-center justify-between px-3 py-2 border-b border-border mb-3">
						{#if $isConnected}
							<WalletConnector />
						{/if}
					</div>

					{#if $isConnected}
						{#each ['/deposit', '/withdraw', '/merge', '/transfer', '/swap'] as route}
							<a
								href="{route}"
								class="block px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 ease-in-out
									{isActive(route)
										? 'scale-105 transform bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg'
										: 'text-text hover:bg-surface hover:scale-105 hover:font-semibold'}"
								on:click={closeMobileMenu}
								aria-current={isActive(route) ? 'page' : undefined}
							>
								{$t(`nav.${route.slice(1)}`)}
							</a>
						{/each}

						<div class="border-t border-border pt-3 mt-3 flex justify-center gap-4">
							<button
								class="rounded-lg p-3 text-text hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
								title="Export operations"
								on:click={handleExport}
							>
								<Download size={20} />
							</button>
							<button
								class="rounded-lg p-3 text-text hover:bg-surface hover:scale-110 transition-all duration-300 ease-in-out"
								title="Import operations"
								on:click={openFilePicker}
							>
								<Upload size={20} />
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<input
		type="file"
		accept="application/json"
		bind:this={fileInput}
		class="hidden"
		on:change={handleFileSelected}
	/>
</nav>

<SettingsModal show={showSettings} onClose={closeSettings} />
