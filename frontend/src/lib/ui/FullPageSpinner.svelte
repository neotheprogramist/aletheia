<script lang="ts">
	export let message = 'Loading…';
</script>

<div class="bg-background fixed inset-0 flex flex-col items-center justify-center">
	<div class="border-primary mb-4 h-16 w-16 animate-spin rounded-full border-b-4"></div>
	<p class="text-gray-400">{message}</p>
</div>
