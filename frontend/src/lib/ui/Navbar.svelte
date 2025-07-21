<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import SettingsModal from '$lib/ui/SettingsModal.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, FolderOpen, Menu, X, Settings, Upload, Copy, Check, Eye } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';
	import { t } from '$lib/i18n';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Modal from '$lib/ui/Modal.svelte';

	let fileInput: HTMLInputElement;
	let showMobileMenu = false;
	let showSettings = false;
	let copied = false;
	let showDataModal = false;
	let modalCopied = false;
	let exportData = '';

	function toggleMobileMenu(event: MouseEvent) {
		event.stopPropagation();
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		// Don't close if clicking on the menu itself or the hamburger button
		if (showMobileMenu && !target.closest('.mobile-menu') && !target.closest('.mobile-menu-button')) {
			closeMobileMenu();
		}
	}

	function toggleSettings() {
		showSettings = !showSettings;
	}

	function closeSettings() {
		showSettings = false;
	}

	function closeDataModal() {
		showDataModal = false;
		modalCopied = false;
		exportData = '';
	}

	async function showDataInModal() {
		try {
			const data = await exportOperations();
			exportData = JSON.stringify(JSON.parse(data), null, 2);
			showDataModal = true;
		} catch (err) {
			console.error('Failed to export operations:', err);
			toastStore.addToast({
				type: 'error',
				message: 'Failed to export operations'
			});
		}
	}

	async function copyFromModal() {
		try {
			const compactJson = JSON.stringify(JSON.parse(exportData));

			if (navigator.clipboard && window.isSecureContext) {
				console.log('Using modern clipboard API');
				await navigator.clipboard.writeText(compactJson);
			}

			modalCopied = true;
			
			toastStore.addToast({
				type: 'info',
				message: $t('notifications.security_warning'),
				duration: 8000
			});
			
			setTimeout(() => {
				modalCopied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy from modal:', err);
			toastStore.addToast({
				type: 'error',
				message: 'Failed to copy to clipboard'
			});
		}
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

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
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
						alt={$t('ui.navbar.aletheia')}
						class="h-6 w-6 transition-transform duration-200 group-hover:scale-110 sm:h-8 sm:w-8"
					/>
					<div
						class="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full bg-green-400"
					></div>
				</div>
				<span
					class="hidden bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent md:block"
					>{$t('ui.navbar.aletheia')}</span
				>
			</a>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-6 lg:flex">
				{#if $isConnected}
					{#each ['/deposit', '/withdraw', '/merge', '/transfer', '/swap'] as route}
						<a
							href={route}
							class="rounded-lg px-2 py-2 transition-all duration-300 ease-in-out"
							class:active={page.url.pathname.includes(route)}
							aria-current={page.url.pathname.includes(route) ? 'page' : undefined}
						>
							{$t(`nav.${route.slice(1)}`)}
						</a>
					{/each}

					<div class="flex items-center gap-2">
						<Tooltip text={$t('tooltips.navbar.view_operations')} position="bottom" theme="dark">
							<button
								class="text-text-secondary hover:text-primary hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
								on:click={showDataInModal}
							>
								<Eye size={18} />
							</button>
						</Tooltip>

						<!-- <Tooltip text={copied ? $t('tooltips.common.copied') : $t('tooltips.navbar.copy')} position="bottom" theme="dark">
							<button
								class="text-text-secondary hover:text-primary hover:bg-surface rounded-lg p-2 transition-all duration-300 ease-in-out hover:scale-110"
								class:text-green-600={copied}
								class:bg-green-50={copied}
								class:dark:bg-green-900={copied}
								on:click={copyOperations}
							>
								{#if copied}
									<Check size={18} />
								{:else}
									<Copy size={18} />
								{/if}
							</button>
						</Tooltip> -->

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
			<div class="mobile-menu border-border bg-card border-t lg:hidden">
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
								class:active={page.url.pathname.includes(route)}
								on:click={closeMobileMenu}
								aria-current={page.url.pathname.includes(route) ? 'page' : undefined}
							>
								{$t(`nav.${route.slice(1)}`)}
							</a>
						{/each}

						<div class="border-border mt-3 flex justify-center gap-4 border-t pt-3">
							<button
								class="text-text hover:bg-surface rounded-lg p-3 transition-all duration-300 ease-in-out hover:scale-110"
								title={$t('tooltips.navbar.view_operations')}
								on:click={showDataInModal}
							>
								<Eye size={20} />
							</button>
							<!-- <button
								class="text-text hover:bg-surface rounded-lg p-3 transition-all duration-300 ease-in-out hover:scale-110"
								class:text-green-600={copied}
								class:bg-green-50={copied}
								class:dark:bg-green-900={copied}
								title={copied ? $t('tooltips.common.copied') : $t('tooltips.navbar.copy')}
								on:click={copyOperations}
							>
								{#if copied}
									<Check size={20} />
								{:else}
									<Copy size={20} />
								{/if}
							</button> -->
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
							<button
								class="text-text hover:bg-surface rounded-lg p-3 transition-all duration-300 ease-in-out hover:scale-110"
								title={$t('tooltips.navbar.settings')}
								on:click={toggleSettings}
							>
								<Settings size={20} />
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

<Modal
	title={$t('ui.modal.operations_data.title')}
	show={showDataModal}
	onClose={closeDataModal}
	singleButton={false}
	confirmText={$t('ui.modal.operations_data.close')}
	cancelText="Cancel"
	showButtons={false}
>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-medium">{$t('ui.modal.operations_data.export_data')}</h3>
			<button
				class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
				class:bg-green-600={modalCopied}
				class:hover:bg-green-700={modalCopied}
				on:click={copyFromModal}
			>
				{#if modalCopied}
					<Check size={16} />
					{$t('ui.modal.operations_data.copied')}
				{:else}
					<Copy size={16} />
					{$t('ui.modal.operations_data.copy')}
				{/if}
			</button>
		</div>
		<div
			class="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<pre
				class="text-sm break-words whitespace-pre-wrap text-gray-800 dark:text-gray-200">{exportData}</pre>
		</div>
		<div class="flex justify-end">
			<button
				class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
				on:click={closeDataModal}
			>
				{$t('ui.modal.operations_data.close')}
			</button>
		</div>
	</div>
</Modal>

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
		background: linear-gradient(
			90deg,
			transparent,
			var(--color-primary),
			var(--color-secondary),
			transparent
		);
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
