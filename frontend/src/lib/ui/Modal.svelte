<script lang="ts">
	import { onMount } from 'svelte';

	// Modal props
	export let title: string = '';
	export let confirmText: string = 'Close';
	export let cancelText: string = 'Cancel';
	export let show: boolean = false;
	export let closeOnOutsideClick: boolean = true;
	export let showButtons: boolean = true;
	export let singleButton: boolean = false;

	// Callback props
	export let onConfirm: () => void = () => {};
	export let onCancel: () => void = () => {};
	export let onClose: () => void = () => {};

	function handleConfirm() {
		onConfirm();
	}
	function handleCancel() {
		onCancel();
	}
	function handleClose() {
		onClose();
	}

	function outsideClick(event: MouseEvent) {
		if (!closeOnOutsideClick) return;
		const dialog = document.getElementById('modal-dialog');
		if (dialog && !dialog.contains(event.target as Node)) {
			handleClose();
		}
	}

	onMount(() => {
		if (closeOnOutsideClick) document.addEventListener('mousedown', outsideClick);
		return () => {
			if (closeOnOutsideClick) document.removeEventListener('mousedown', outsideClick);
		};
	});
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="fixed inset-0 bg-black opacity-50"></div>
		<div
			id="modal-dialog"
			class="z-60 w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
		>
			<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
			<div class="mb-6">
				<slot />
			</div>
			{#if showButtons}
				<div class="flex justify-end space-x-2">
					{#if !singleButton}
						<button
							class="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
							on:click={handleCancel}
						>
							{cancelText}
						</button>
					{/if}
					<button
						class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
						on:click={singleButton ? handleClose : handleConfirm}
					>
						{confirmText}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
