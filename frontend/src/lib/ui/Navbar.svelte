<script lang="ts">
	import { page } from '$app/state';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import SettingsModal from '$lib/ui/SettingsModal.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, FolderOpen, Menu, X, Settings } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';
	import { t } from '$lib/i18n';
	import Tooltip from '$lib/ui/Tooltip.svelte';

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
				message: $t('notifications.export_success')
			});
		} catch (err) {
			console.error(err);
			toastStore.addToast({
				type: 'error',
				message: $t('notifications.export_failed')
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
					message: $t('notifications.import_success')
				});
			} catch (err) {
				console.error(err);
				toastStore.addToast({
					type: 'error',
					message: $t('notifications.import_failed')
				});
			} finally {
				input.value = '';
			}
		};

		reader.onerror = () => {
			toastStore.addToast({
				type: 'error',
				message: $t('notifications.file_read_error')
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
			<a
				href="/"
				class="group text-primary flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl"
			>
				<div class="relative">
					<img
						src="/logo.svg"
						alt={$t('ui.navbar.privacy_pools')}
						class="h-6 w-6 transition-transform duration-200 group-hover:scale-110 sm:h-8 sm:w-8"
					/>
					<div
						class="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full bg-green-400"
					></div>
				</div>
				<span
					class="hidden bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent md:block"
					>{$t('ui.navbar.privacy_pools')}</span
				>
			</a>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-6 lg:flex">
				{#if $isConnected}
					{#each ['/deposit', '/withdraw', '/merge', '/transfer', '/swap'] as route}
						<a
							href={route}
							class="rounded-lg px-2 py-2 transition-all duration-300 ease-in-out"
							class:active="{page.url.pathname.includes(route)}"
							aria-current={page.url.pathname.includes(route) ? 'page' : undefined}
						>
							{$t(`nav.${route.slice(1)}`)}
						</a>
					{/each}

					<div class="flex items-center gap-2">
						<Tooltip text={$t('tooltips.navbar.export')} position="bottom" theme="dark">
							<button
								class="text-text-secondary hover:text-primary hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
								on:click={handleExport}
							>
								<Download size={18} />
							</button>
						</Tooltip>

						<Tooltip text={$t('tooltips.navbar.import')} position="bottom" theme="dark">
							<button
								class="text-text-secondary hover:text-primary hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
								on:click={openFilePicker}
							>
								<FolderOpen size={18} />
							</button>
						</Tooltip>
					</div>
				{/if}

				<div class="flex items-center gap-3">
					{#if $isConnected}
						<WalletConnector />
					{/if}
					<Tooltip text={$t('tooltips.navbar.settings')} position="bottom" theme="dark">
						<button
							class="text-text-secondary hover:text-primary hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
							on:click={toggleSettings}
						>
							<Settings size={18} />
						</button>
					</Tooltip>
				</div>
			</div>

			<!-- Mobile menu button -->
			<div class="flex items-center lg:hidden">
				<button
					class="mobile-menu-button text-text hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
					on:click={toggleMobileMenu}
					aria-label={$t('ui.navbar.toggle_mobile_menu')}
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
			<div class="border-border bg-card border-t lg:hidden">
				<div class="space-y-1 px-2 pt-2 pb-3">
					<div class="border-border mb-3 flex items-center justify-between border-b px-3 py-2">
						{#if $isConnected}
							<WalletConnector />
						{/if}
					</div>

					{#if $isConnected}
						{#each ['/deposit', '/withdraw', '/merge', '/transfer', '/swap'] as route}
							<a
								href={route}
								class="block rounded-lg px-3 py-2 text-base font-medium transition-all duration-300 ease-in-out"
								class:active="{page.url.pathname.includes(route)}"
								on:click={closeMobileMenu}
								aria-current={page.url.pathname.includes(route) ? 'page' : undefined}
							>
								{$t(`nav.${route.slice(1)}`)}
							</a>
						{/each}

						<div class="border-border mt-3 flex justify-center gap-4 border-t pt-3">
							<button
								class="text-text hover:bg-surface rounded-lg p-3 transition-all duration-300 ease-in-out hover:scale-110"
								title={$t('ui.navbar.export_operations')}
								on:click={handleExport}
							>
								<Download size={20} />
							</button>
							<button
								class="text-text hover:bg-surface rounded-lg p-3 transition-all duration-300 ease-in-out hover:scale-110"
								title={$t('ui.navbar.import_operations')}
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

<style>
	/* Desktop active link - czysty look z dolnym podświetleniem */
	.active:not(.block) {
		position: relative;
		color: var(--color-primary);
		font-weight: 600;
		text-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
		transform: translateY(-1px);
	}

	.active:not(.block)::before {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 50%;
		width: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--color-primary), var(--color-secondary), transparent);
		transform: translateX(-50%);
		animation: expandGlow 0.3s ease-out forwards;
		box-shadow: 0 0 8px var(--color-primary);
	}

	/* Mobile active link - gradient block */
	.active.block {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: white;
		font-weight: 600;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
		transform: scale(1.02);
		position: relative;
		overflow: hidden;
	}

	.active.block::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		animation: shimmer 1.5s infinite;
	}

	/* Animacje */
	@keyframes expandGlow {
		from {
			width: 0;
		}
		to {
			width: 100%;
		}
	}

	@keyframes shimmer {
		0% {
			left: -100%;
		}
		100% {
			left: 100%;
		}
	}

	/* Hover effects dla nieaktywnych linków */
	a:not(.active):hover {
		color: var(--color-primary);
		transform: translateY(-1px);
		text-shadow: 0 0 4px rgba(59, 130, 246, 0.2);
		transition: all 0.3s ease;
	}
</style>
