<script lang="ts">
	import { AlertTriangle, X } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';

	let showBanner = true;
	let dismissed = false;
	let isMinimized = false;

	onMount(() => {
		// Check if user hid banner this session
		const bannerDismissed = sessionStorage.getItem('beta-banner-dismissed');
		if (bannerDismissed === 'true') {
			showBanner = false;
			dismissed = true;
		}

		// Check if banner was minimized
		const bannerMinimized = sessionStorage.getItem('beta-banner-minimized');
		if (bannerMinimized === 'true') {
			isMinimized = true;
		}
	});

	function dismissBanner() {
		showBanner = false;
		dismissed = true;
		sessionStorage.setItem('beta-banner-dismissed', 'true');
	}

	function toggleMinimize() {
		isMinimized = !isMinimized;
		sessionStorage.setItem('beta-banner-minimized', isMinimized.toString());
	}
</script>

{#if showBanner && !dismissed}
	<div
		class="beta-banner sticky z-20 overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white transition-all duration-300 ease-in-out"
		style="top: 64px;"
		class:minimized={isMinimized}
	>
		<!-- Animated background pattern -->
		<div class="absolute inset-0 opacity-20">
			<div class="wave-pattern"></div>
		</div>

		<div
			class="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
			class:py-3={!isMinimized}
			class:py-2={isMinimized}
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center space-x-3">
					<div class="flex-shrink-0">
						<AlertTriangle class="h-6 w-6 animate-pulse {isMinimized ? 'hidden' : ''}" />
					</div>
					<div class="flex-1">
						<p class="text-sm font-semibold sm:text-base">
							<span
								class="mr-2 inline-block animate-bounce rounded bg-white px-2 py-1 text-xs font-bold text-red-600"
							>
								BETA
							</span>
							{#if !isMinimized}
								{$t('banner.beta_warning.title') ||
									'⚠️ This is a BETA version - Use with extreme caution!'}
							{:else}
								BETA Warning
							{/if}
						</p>
						{#if !isMinimized}
							<p class="mt-1 text-xs opacity-90 sm:text-sm">
								{$t('banner.beta_warning.description') ||
									'Funds deposited may be lost permanently. Only use small amounts for testing.'}
							</p>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					<button
						on:click={toggleMinimize}
						class="flex-shrink-0 rounded-full p-1 transition-colors duration-200 hover:bg-white/20"
						aria-label={isMinimized ? 'Expand warning' : 'Minimize warning'}
					>
						<div class="flex h-5 w-5 items-center justify-center">
							{#if isMinimized}
								<div class="h-0.5 w-3 bg-white"></div>
								<div class="absolute h-3 w-0.5 bg-white"></div>
							{:else}
								<div class="h-0.5 w-3 bg-white"></div>
							{/if}
						</div>
					</button>
					<button
						on:click={dismissBanner}
						class="flex-shrink-0 rounded-full p-1 transition-colors duration-200 hover:bg-white/20"
						aria-label={$t('banner.beta_warning.dismiss')}
					>
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.beta-banner {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.beta-banner.minimized {
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
	}

	.wave-pattern {
		background-image:
			radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.2) 0%, transparent 50%),
			radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
			radial-gradient(circle at 40% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
		animation: drift 8s ease-in-out infinite alternate;
	}

	@keyframes drift {
		0% {
			transform: translateX(-10px) translateY(-5px);
		}
		100% {
			transform: translateX(10px) translateY(5px);
		}
	}
</style>
