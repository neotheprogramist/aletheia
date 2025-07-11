<script lang="ts">
	import { onMount } from 'svelte';
	import { isConnected } from '$lib/stores/wallet';
	import OnboardingGuide from '$lib/ui/OnboardingGuide.svelte';
	import Button from '$lib/ui/Button.svelte';
	import HelpIcon from '$lib/ui/HelpIcon.svelte';
	
	let showOnboarding = false;
	
	onMount(() => {
		const hasSeenOnboarding = localStorage.getItem('privacy-pools-onboarding-seen');
		if (!hasSeenOnboarding) {
			showOnboarding = true;
		}
	});
	
	function handleOnboardingComplete() {
		localStorage.setItem('privacy-pools-onboarding-seen', 'true');
		showOnboarding = false;
	}
	
	function handleOnboardingSkip() {
		localStorage.setItem('privacy-pools-onboarding-seen', 'true');
		showOnboarding = false;
	}
	
	function showOnboardingAgain() {
		showOnboarding = true;
	}
</script>

<div class="mx-auto max-w-4xl p-3 sm:p-6">
	<div class="text-center mb-6 sm:mb-8">
		<div class="flex items-center justify-center gap-2 sm:gap-3 mb-4">
			<img src="/logo.svg" alt="Privacy Pools" class="w-10 h-10 sm:w-12 sm:h-12" />
			<h1 class="text-primary text-2xl sm:text-3xl lg:text-4xl font-bold">Privacy Pools</h1>
		</div>
		<p class="text-text-secondary text-sm sm:text-base lg:text-lg mb-4 sm:mb-6 px-4">
			Decentralized privacy for your StarkNet transactions
		</p>
		
		{#if !$isConnected}
			<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
				<h2 class="text-blue-800 dark:text-blue-200 text-lg sm:text-xl font-semibold mb-2">
					Get Started
				</h2>
				<p class="text-blue-700 dark:text-blue-300 text-sm sm:text-base mb-4">
					Connect your wallet to start using Privacy Pools
				</p>
				<Button text="Show Tutorial" onClick={showOnboardingAgain} variant="outline" />
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
				<div class="bg-card border border-border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow">
					<div class="text-2xl sm:text-3xl mb-2 sm:mb-3">💰</div>
					<h3 class="font-semibold text-base sm:text-lg mb-2 flex items-center gap-2">
						Deposit
						<HelpIcon text="Deposit tokens into the privacy pool to create anonymous notes" />
					</h3>
					<p class="text-text-secondary text-xs sm:text-sm">
						Add tokens to the privacy pool and receive a private note
					</p>
				</div>
				
				<div class="bg-card border border-border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow">
					<div class="text-2xl sm:text-3xl mb-2 sm:mb-3">🎭</div>
					<h3 class="font-semibold text-base sm:text-lg mb-2 flex items-center gap-2">
						Withdraw
						<HelpIcon text="Withdraw tokens anonymously to any address" />
					</h3>
					<p class="text-text-secondary text-xs sm:text-sm">
						Withdraw to any address without revealing the connection
					</p>
				</div>
				
				<div class="bg-card border border-border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow">
					<div class="text-2xl sm:text-3xl mb-2 sm:mb-3">🔄</div>
					<h3 class="font-semibold text-base sm:text-lg mb-2 flex items-center gap-2">
						Transfer
						<HelpIcon text="Send tokens privately between addresses" />
					</h3>
					<p class="text-text-secondary text-xs sm:text-sm">
						Send tokens privately without revealing your identity
					</p>
				</div>
				
				<div class="bg-card border border-border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow">
					<div class="text-2xl sm:text-3xl mb-2 sm:mb-3">🔗</div>
					<h3 class="font-semibold text-base sm:text-lg mb-2 flex items-center gap-2">
						Merge
						<HelpIcon text="Combine multiple deposits into one for better privacy" />
					</h3>
					<p class="text-text-secondary text-xs sm:text-sm">
						Combine multiple deposits to improve privacy
					</p>
				</div>
				
				<div class="bg-card border border-border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow">
					<div class="text-2xl sm:text-3xl mb-2 sm:mb-3">💱</div>
					<h3 class="font-semibold text-base sm:text-lg mb-2 flex items-center gap-2">
						Swap
						<HelpIcon text="Exchange tokens privately through DeFi protocols" />
					</h3>
					<p class="text-text-secondary text-xs sm:text-sm">
						Exchange tokens while maintaining privacy
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<OnboardingGuide 
	bind:show={showOnboarding}
	onComplete={handleOnboardingComplete}
	onSkip={handleOnboardingSkip}
/>
