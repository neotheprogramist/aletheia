<script lang="ts">
	import { page } from '$app/state';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import ToggleTheme from './ToggleTheme.svelte';
	import { isConnected } from '$lib/stores/wallet';
	import { Download, Upload } from 'lucide-svelte';
	import { exportOperations, importOperations } from '$lib/utils/operationsBackup';
	import { toastStore } from '$lib/stores/toast';

	let fileInput: HTMLInputElement;

	/** Trigger export: read all operations, build a JSON blob, and prompt “Save as…” */
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

	/** Open hidden file input to select a JSON for import */
	function openFilePicker() {
		fileInput?.click();
	}

	/** When a file is selected, read it and call importOperations(...) */
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
				input.value = ''; // reset so user can re-select the same file if needed
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

<nav
	class="border-border bg-background fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b px-6 py-3"
>
	<a href="/" class="text-primary text-xl font-bold tracking-tight"> Privacy Pools </a>

	<div class="flex items-center gap-4">
		{#if $isConnected}
			<a
				href="/deposit"
				class={page.url.pathname === '/deposit' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Deposit
			</a>
			<a
				href="/withdraw"
				class={page.url.pathname === '/withdraw' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Withdraw
			</a>
			<a
				href="/merge"
				class={page.url.pathname === '/merge' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Merge
			</a>
			<a
				href="/transfer"
				class={page.url.pathname === '/transfer' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Transfer
			</a>
			<!-- Export button -->
			<button
				class="cursor-pointer rounded p-1 hover:bg-sky-800"
				title="Export all operations to JSON"
				on:click={handleExport}
			>
				<Download size={20} />
			</button>

			<!-- Import button -->
			<button
				class="cursor-pointer rounded p-1 hover:bg-sky-800"
				title="Import operations from JSON"
				on:click={openFilePicker}
			>
				<Upload size={20} />
			</button>

			<!-- Hidden file input for JSON import -->
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
