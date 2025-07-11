<script lang="ts">
	import { HelpCircle } from 'lucide-svelte';
	import Tooltip from './Tooltip.svelte';
	
	export let text: string;
	export let position: 'top' | 'bottom' | 'left' | 'right' = 'top';
	export let size: number = 16;
	export let class_: string = '';
</script>

<Tooltip {text} {position} class_="inline-flex items-center {class_}">
	<HelpCircle 
		{size} 
		class="text-text-secondary hover:text-primary transition-colors duration-200 cursor-help" 
	/>
</Tooltip>