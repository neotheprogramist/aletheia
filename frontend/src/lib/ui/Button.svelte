<script lang="ts">
	import LoadingSpinner from './LoadingSpinner.svelte';
	
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let text: string = 'Click';
	export let onClick: () => void = () => {};
	export let class_: string = '';
	export let loading: boolean = false;
	export let loadingText: string = 'Processing...';
	export let variant: 'primary' | 'secondary' | 'success' | 'danger' | 'outline' = 'primary';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let disabled: boolean = false;
	
	const variantClasses = {
		primary: 'button',
		secondary: 'button-secondary', 
		success: 'button-success',
		danger: 'button-danger',
		outline: 'button-outline'
	};
	
	const sizeClasses = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-4 py-2',
		lg: 'px-6 py-3 text-lg'
	};
</script>

<button
	{type}
	disabled={loading || disabled}
	class="{variantClasses[variant]} {sizeClasses[size]} flex items-center justify-center gap-2 rounded transition-all font-medium
		{loading || disabled ? '!cursor-not-allowed opacity-50' : 'cursor-pointer'}
		{class_}"
	on:click={!loading && !disabled ? onClick : undefined}
	aria-busy={loading}
	aria-disabled={loading || disabled}
>
	{#if loading}
		<LoadingSpinner size="sm" />
	{/if}
	<span>{loading ? loadingText : text}</span>
</button>
