<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';

	export let show: boolean = false;
	export let title: string = 'Operation Progress';
	export let steps: Array<{
		id: string;
		title: string;
		description?: string;
		status: 'pending' | 'loading' | 'completed' | 'error';
	}> = [];
	export let onClose: () => void = () => {};
	export let closeOnOutsideClick: boolean = false;

	function outsideClick(event: MouseEvent) {
		if (!closeOnOutsideClick) return;
		const dialog = document.getElementById('progress-modal-dialog');
		if (dialog && !dialog.contains(event.target as Node)) {
			onClose();
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
			id="progress-modal-dialog"
			class="z-60 w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
		>
			<div class="mb-6">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
				
				<div class="space-y-4">
					{#each steps as step}
						<div class="flex items-center space-x-3">
							<div class="flex-shrink-0">
								{#if step.status === 'loading'}
									<LoadingSpinner size="sm" />
								{:else if step.status === 'completed'}
									<div class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									</div>
								{:else if step.status === 'error'}
									<div class="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
											<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
										</svg>
									</div>
								{:else}
									<div class="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center dark:bg-gray-600">
										<div class="w-2 h-2 bg-gray-500 rounded-full dark:bg-gray-400"></div>
									</div>
								{/if}
							</div>
							
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
									{step.title}
								</div>
								{#if step.description}
									<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										{step.description}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}