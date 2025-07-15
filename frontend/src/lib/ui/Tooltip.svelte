<script lang="ts">
	import { onDestroy } from 'svelte';
	
	export let text: string;
	export let position: 'top' | 'bottom' | 'left' | 'right' = 'top';
	export let delay: number = 200;
	export let class_: string = '';
	export let maxWidth: string = '200px';
	export let theme: 'dark' | 'light' = 'dark';
	export let showDelay: number = 0;
	export let hideDelay: number = 100;
	
	let showTooltip = false;
	let tooltipElement: HTMLElement;
	let showTimeoutId: number;
	let hideTimeoutId: number;
	
	function show() {
		clearTimeout(hideTimeoutId);
		showTimeoutId = window.setTimeout(() => {
			showTooltip = true;
		}, showDelay || delay);
	}
	
	function hide() {
		clearTimeout(showTimeoutId);
		hideTimeoutId = window.setTimeout(() => {
			showTooltip = false;
		}, hideDelay);
	}
	
	const positionClasses = {
		top: 'bottom-full mb-2 left-1/2 transform -translate-x-1/2',
		bottom: 'top-full mt-2 left-1/2 transform -translate-x-1/2',
		left: 'right-full mr-2 top-1/2 transform -translate-y-1/2',
		right: 'left-full ml-2 top-1/2 transform -translate-y-1/2'
	};
	
	const themeClasses = {
		dark: 'bg-gray-900 text-white border-gray-700',
		light: 'bg-white text-gray-900 border-gray-200 shadow-xl'
	};
	
	const arrowClasses = {
		dark: {
			top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-900',
			bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-900',
			left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-900',
			right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-900'
		},
		light: {
			top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-white',
			bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-white',
			left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-white',
			right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-white'
		}
	};
	
	onDestroy(() => {
		clearTimeout(showTimeoutId);
		clearTimeout(hideTimeoutId);
	});
</script>

<div 
	class="relative block {class_}"
	on:mouseenter={show}
	on:mouseleave={hide}
	on:focus={show}
	on:blur={hide}
	role="button"
	tabindex="0"
>
	<slot />
	
	{#if showTooltip}
		<div
			bind:this={tooltipElement}
			class="absolute z-50 px-3 py-2 text-sm font-medium rounded-lg border backdrop-blur-sm transition-all duration-200 ease-out transform scale-100 opacity-100 animate-tooltip-in {themeClasses[theme]} {positionClasses[position]}"
			style="max-width: {maxWidth}; word-wrap: break-word; white-space: normal;"
			role="tooltip"
		>
			{text}
			<div class="absolute w-0 h-0 border-4 {arrowClasses[theme][position]}"></div>
		</div>
	{/if}
</div>

<style>
	@keyframes tooltip-in {
		from {
			opacity: 0;
			transform: scale(0.8);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	
	:global(.animate-tooltip-in) {
		animation: tooltip-in 150ms ease-out;
	}
</style>