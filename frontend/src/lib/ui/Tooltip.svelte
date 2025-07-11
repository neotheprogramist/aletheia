<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	
	export let text: string;
	export let position: 'top' | 'bottom' | 'left' | 'right' = 'top';
	export let delay: number = 300;
	export let class_: string = '';
	
	let showTooltip = false;
	let tooltipElement: HTMLElement;
	let timeoutId: number;
	
	function show() {
		timeoutId = window.setTimeout(() => {
			showTooltip = true;
		}, delay);
	}
	
	function hide() {
		clearTimeout(timeoutId);
		showTooltip = false;
	}
	
	const positionClasses = {
		top: 'bottom-full mb-2 left-1/2 transform -translate-x-1/2',
		bottom: 'top-full mt-2 left-1/2 transform -translate-x-1/2',
		left: 'right-full mr-2 top-1/2 transform -translate-y-1/2',
		right: 'left-full ml-2 top-1/2 transform -translate-y-1/2'
	};
	
	const arrowClasses = {
		top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800',
		bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800',
		left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-800',
		right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-800'
	};
	
	onDestroy(() => {
		clearTimeout(timeoutId);
	});
</script>

<div 
	class="relative inline-block {class_}"
	on:mouseenter={show}
	on:mouseleave={hide}
	on:focus={show}
	on:blur={hide}
>
	<slot />
	
	{#if showTooltip}
		<div
			bind:this={tooltipElement}
			class="absolute z-50 px-2 py-1 text-sm font-medium text-white bg-gray-800 rounded-md shadow-lg whitespace-nowrap {positionClasses[position]}"
			role="tooltip"
		>
			{text}
			<div class="absolute w-0 h-0 border-4 {arrowClasses[position]}"></div>
		</div>
	{/if}
</div>