<script lang="ts">
	import { onMount } from 'svelte';
	import { availableLanguages, currentLanguage, changeLanguage, t } from '$lib/i18n';
	import { Check } from 'lucide-svelte';

	export let show: boolean = false;
	export let onClose: () => void = () => {};

	let selectedLanguage = 'en';

	onMount(() => {
		currentLanguage.subscribe(lang => {
			selectedLanguage = lang;
		});
	});

	function handleLanguageChange(lang: string) {
		changeLanguage(lang);
		selectedLanguage = lang;
	}

	function outsideClick(event: MouseEvent) {
		const dialog = document.getElementById('settings-modal-dialog');
		if (dialog && !dialog.contains(event.target as Node)) {
			onClose();
		}
	}

	onMount(() => {
		document.addEventListener('mousedown', outsideClick);
		return () => {
			document.removeEventListener('mousedown', outsideClick);
		};
	});
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="fixed inset-0 bg-black opacity-50"></div>
		<div
			id="settings-modal-dialog"
			class="z-60 w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
		>
			<h2 class="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">{$t('settings.title')}</h2>
			
			<!-- Language Selection -->
			<div class="mb-6">
				<h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-gray-100">{$t('settings.language')}</h3>
				<div class="space-y-2">
					{#each Object.entries(availableLanguages) as [code, info]}
						<button
							class="w-full flex items-center justify-between p-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors duration-200 border border-gray-300 dark:border-gray-600"
							on:click={() => handleLanguageChange(code)}
						>
							<div class="flex items-center space-x-3">
								<span class="text-xl">{info.flag}</span>
								<span class="text-gray-900 dark:text-gray-100 {code === 'he' ? 'font-medium' : ''}">{info.name}</span>
							</div>
							{#if selectedLanguage === code}
								<Check class="w-5 h-5 text-blue-600" />
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Close Button -->
			<div class="flex justify-end">
				<button
					class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					on:click={onClose}
				>
					{$t('settings.close')}
				</button>
			</div>
		</div>
	</div>
{/if}