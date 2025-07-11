<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import ToggleTheme from './ToggleTheme.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, Upload, Menu, X } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';

	let fileInput: HTMLInputElement;
	let showMobileMenu = false;

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
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


</script>

<nav class="border-border bg-background fixed inset-x-0 top-0 z-10 border-b backdrop-blur-sm">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<!-- Logo -->
			<div class="flex items-center">
				<a href="/" class="text-primary text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
					<img src="/logo.svg" alt="Privacy Pools" class="w-6 h-6 sm:w-8 sm:h-8" />
					<span class="hidden md:block">Privacy Pools</span>
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden xl:flex items-center space-x-8 nav-links">
				{#if $isConnected}
					<a
						href="/deposit"
						class="{page.url.pathname === '/deposit' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-text-secondary hover:text-primary'} transition-colors duration-200 py-2"
						>Deposit</a
					>
					<a
						href="/withdraw"
						class="{page.url.pathname === '/withdraw' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-text-secondary hover:text-primary'} transition-colors duration-200 py-2"
						>Withdraw</a
					>
					<a
						href="/merge"
						class="{page.url.pathname === '/merge' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-text-secondary hover:text-primary'} transition-colors duration-200 py-2"
						>Merge</a
					>
					<a
						href="/transfer"
						class="{page.url.pathname === '/transfer' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-text-secondary hover:text-primary'} transition-colors duration-200 py-2"
						>Transfer</a
					>
					<a
						href="/swap"
						class="{page.url.pathname === '/swap' ? 'text-primary font-semibold border-b-2 border-primary' : 'text-text-secondary hover:text-primary'} transition-colors duration-200 py-2"
						>Swap</a
					>

					<div class="flex items-center gap-2">
						<button
							class="rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-surface transition-all duration-200"
							title="Export all operations to JSON"
							on:click={handleExport}
						>
							<Download size={18} />
						</button>

						<button
							class="rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-surface transition-all duration-200"
							title="Import operations from JSON"
							on:click={openFilePicker}
						>
							<Upload size={18} />
						</button>
					</div>
				{/if}

				<div class="flex items-center gap-3">
					<WalletConnector />
					<ToggleTheme />
				</div>
			</div>

			<!-- Mobile menu button -->
			<div class="xl:hidden flex items-center">
				<button
					class="mobile-menu-button rounded-lg p-2 text-text hover:bg-surface transition-colors duration-200"
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
					<!-- Wallet and Theme Controls -->
					<div class="flex items-center justify-between px-3 py-2 border-b border-border mb-3">
						<WalletConnector />
						<ToggleTheme />
					</div>
					
					{#if $isConnected}
						<a
							href="/deposit"
							class="{page.url.pathname === '/deposit' ? 'bg-primary text-white' : 'text-text hover:bg-surface'} block px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200"
							on:click={closeMobileMenu}
							>Deposit</a
						>
						<a
							href="/withdraw"
							class="{page.url.pathname === '/withdraw' ? 'bg-primary text-white' : 'text-text hover:bg-surface'} block px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200"
							on:click={closeMobileMenu}
							>Withdraw</a
						>
						<a
							href="/merge"
							class="{page.url.pathname === '/merge' ? 'bg-primary text-white' : 'text-text hover:bg-surface'} block px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200"
							on:click={closeMobileMenu}
							>Merge</a
						>
						<a
							href="/transfer"
							class="{page.url.pathname === '/transfer' ? 'bg-primary text-white' : 'text-text hover:bg-surface'} block px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200"
							on:click={closeMobileMenu}
							>Transfer</a
						>
						<a
							href="/swap"
							class="{page.url.pathname === '/swap' ? 'bg-primary text-white' : 'text-text hover:bg-surface'} block px-3 py-2 rounded-lg text-base font-medium transition-colors duration-200"
							on:click={closeMobileMenu}
							>Swap</a
						>
						
						<div class="border-t border-border pt-3 mt-3">
							<div class="flex justify-center gap-4">
								<button
									class="rounded-lg p-3 text-text hover:bg-surface transition-colors duration-200"
									title="Export operations"
									on:click={handleExport}
								>
									<Download size={20} />
								</button>
								<button
									class="rounded-lg p-3 text-text hover:bg-surface transition-colors duration-200"
									title="Import operations"
									on:click={openFilePicker}
								>
									<Upload size={20} />
								</button>
							</div>
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