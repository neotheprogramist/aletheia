<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import ToggleTheme from './ToggleTheme.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, Upload, ChevronDown } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';

	let fileInput: HTMLInputElement;
	let dropdownRef: HTMLElement | null = null;
	let showVesuDropdown = false;

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

	function toggleDropdown() {
		showVesuDropdown = !showVesuDropdown;
	}

	function closeDropdown() {
		showVesuDropdown = false;
	}

	function onClickOutside(node: HTMLElement, handler: () => void) {
		const handleClick = (event: MouseEvent) => {
			if (!node.contains(event.target as Node)) handler();
		};
		document.addEventListener('click', handleClick);
		return {
			destroy() {
				document.removeEventListener('click', handleClick);
			}
		};
	}

	let destroyClickOutside: { destroy: () => void } | null = null;

	$: if (dropdownRef) {
		// Clean up previous listener
		destroyClickOutside?.destroy?.();
		// Attach new one
		destroyClickOutside = onClickOutside(dropdownRef, closeDropdown);
	}
</script>

<nav
	class="border-border bg-background fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b px-6 py-3"
>
	<a href="/" class="text-primary text-xl font-bold tracking-tight"> Privacy Pools </a>

	<div class="flex items-center gap-4">
		{#if $isConnected}
			<a
				href="/deposit"
				class={page.url.pathname === '/deposit' ? 'font-bold text-sky-500' : 'hover:underline'}
				>Deposit</a
			>
			<a
				href="/withdraw"
				class={page.url.pathname === '/withdraw' ? 'font-bold text-sky-500' : 'hover:underline'}
				>Withdraw</a
			>
			<a
				href="/merge"
				class={page.url.pathname === '/merge' ? 'font-bold text-sky-500' : 'hover:underline'}
				>Merge</a
			>
			<a
				href="/transfer"
				class={page.url.pathname === '/transfer' ? 'font-bold text-sky-500' : 'hover:underline'}
				>Transfer</a
			>
			<a
				href="/swap"
				class={page.url.pathname === '/swap' ? 'font-bold text-sky-500' : 'hover:underline'}>Swap</a
			>

			<div class="relative" bind:this={dropdownRef}>
				<button class="flex items-center gap-1 hover:underline" on:click={toggleDropdown}>
					Vesu <ChevronDown size={16} />
				</button>
				{#if showVesuDropdown}
					<div
						class="border-border bg-background absolute right-0 mt-2 w-32 rounded-md border shadow-lg"
					>
						<a href="/vesu/borrow" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
							Borrow
						</a>
					</div>
				{/if}
			</div>

			<button
				class="cursor-pointer rounded p-1 hover:bg-sky-800"
				title="Export all operations to JSON"
				on:click={handleExport}
			>
				<Download size={20} />
			</button>

			<button
				class="cursor-pointer rounded p-1 hover:bg-sky-800"
				title="Import operations from JSON"
				on:click={openFilePicker}
			>
				<Upload size={20} />
			</button>

			<input
				type="file"
				accept="application/json"
				bind:this={fileInput}
				class="hidden"
				on:change={handleFileSelected}
			/>
		{/if}

		<WalletConnector />
		<ToggleTheme />
	</div>
</nav>
