<script lang="ts">
	export let data: any;
	export let filePrefix: string = 'output';

	function copyData() {
		if (data) {
			navigator.clipboard
				.writeText(JSON.stringify(data, null, 2))
				.then(() => alert('Data copied to clipboard!'))
				.catch((err) => console.error('Copy failed:', err));
		}
	}

	function downloadData() {
		if (data) {
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `${filePrefix}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
	}
</script>

<div class="mt-4 flex gap-4">
	<button
		on:click={copyData}
		class="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white shadow-md transition-transform hover:scale-105"
	>
		Copy Data
	</button>
	<button
		on:click={downloadData}
		class="rounded-lg bg-gray-500 px-4 py-2 text-sm text-white shadow-md transition-transform hover:scale-105"
	>
		Download JSON
	</button>
</div>
