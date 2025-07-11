<script lang="ts">
	import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-svelte';
	
	export let type: 'success' | 'error' | 'warning' | 'info' = 'info';
	export let title: string = '';
	export let dismissible: boolean = false;
	export let class_: string = '';
	export let onDismiss: () => void = () => {};
	
	const typeConfig = {
		success: {
			icon: CheckCircle,
			bgClass: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
			iconClass: 'text-green-400',
			titleClass: 'text-green-800 dark:text-green-200',
			textClass: 'text-green-700 dark:text-green-300'
		},
		error: {
			icon: XCircle,
			bgClass: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
			iconClass: 'text-red-400',
			titleClass: 'text-red-800 dark:text-red-200',
			textClass: 'text-red-700 dark:text-red-300'
		},
		warning: {
			icon: AlertCircle,
			bgClass: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
			iconClass: 'text-yellow-400',
			titleClass: 'text-yellow-800 dark:text-yellow-200',
			textClass: 'text-yellow-700 dark:text-yellow-300'
		},
		info: {
			icon: Info,
			bgClass: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
			iconClass: 'text-blue-400',
			titleClass: 'text-blue-800 dark:text-blue-200',
			textClass: 'text-blue-700 dark:text-blue-300'
		}
	};
	
	$: config = typeConfig[type];
</script>

<div class="rounded-lg border p-4 {config.bgClass} {class_}">
	<div class="flex">
		<div class="flex-shrink-0">
			<svelte:component this={config.icon} class="h-5 w-5 {config.iconClass}" />
		</div>
		<div class="ml-3 flex-1">
			{#if title}
				<h3 class="text-sm font-medium {config.titleClass}">
					{title}
				</h3>
			{/if}
			<div class="text-sm {config.textClass} {title ? 'mt-2' : ''}">
				<slot />
			</div>
		</div>
		{#if dismissible}
			<div class="ml-auto pl-3">
				<button
					class="inline-flex rounded-md p-1.5 {config.textClass} hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2"
					on:click={onDismiss}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{/if}
	</div>
</div>