<script lang="ts">
	export let progress: number = 0; // 0-100
	export let label: string = '';
	export let showPercentage: boolean = true;
	export let class_: string = '';
	export let color: 'primary' | 'success' | 'warning' | 'error' = 'primary';
	
	const colorClasses = {
		primary: 'bg-primary',
		success: 'bg-success',
		warning: 'bg-warning',
		error: 'bg-error'
	};
	
	$: clampedProgress = Math.min(Math.max(progress, 0), 100);
</script>

<div class="w-full {class_}">
	{#if label || showPercentage}
		<div class="flex justify-between items-center mb-2">
			{#if label}
				<span class="text-sm font-medium text-text">{label}</span>
			{/if}
			{#if showPercentage}
				<span class="text-sm text-text-secondary">{Math.round(clampedProgress)}%</span>
			{/if}
		</div>
	{/if}
	
	<div class="w-full bg-surface rounded-full h-2.5 overflow-hidden">
		<div 
			class="{colorClasses[color]} h-2.5 rounded-full transition-all duration-300 ease-out"
			style="width: {clampedProgress}%"
		></div>
	</div>
</div>