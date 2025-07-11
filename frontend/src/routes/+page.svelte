<script lang="ts">
	import { onMount } from 'svelte';
	import { isConnected } from '$lib/stores/wallet';
	import OnboardingGuide from '$lib/ui/OnboardingGuide.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import { Shield, Eye, Shuffle, Merge, ArrowRightLeft, ChevronRight, Lock, Zap, Users, Target } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	
	let showOnboarding = false;
	let showFeatureModal = false;
	let selectedFeature: any = null;
	
	const features = [
		{
			id: 'deposit',
			titleKey: 'home.features.deposit.title',
			icon: Shield,
			gradient: 'from-green-400 to-blue-500',
			descriptionKey: 'home.features.deposit.description',
			href: '/deposit',
			details: {
				titleKey: 'features.private_deposits.title',
				descriptionKey: 'features.private_deposits.description',
				howItWorksKeys: 'features.private_deposits.how_it_works',
				benefitsKeys: 'features.private_deposits.benefits',
				useCasesKeys: 'features.private_deposits.use_cases'
			}
		},
		{
			id: 'withdraw',
			titleKey: 'home.features.withdraw.title',
			icon: Eye,
			gradient: 'from-purple-400 to-pink-500',
			descriptionKey: 'home.features.withdraw.description',
			href: '/withdraw',
			details: {
				titleKey: 'features.anonymous_withdrawals.title',
				descriptionKey: 'features.anonymous_withdrawals.description',
				howItWorksKeys: 'features.anonymous_withdrawals.how_it_works',
				benefitsKeys: 'features.anonymous_withdrawals.benefits',
				useCasesKeys: 'features.anonymous_withdrawals.use_cases'
			}
		},
		{
			id: 'transfer',
			titleKey: 'home.features.transfer.title',
			icon: ArrowRightLeft,
			gradient: 'from-blue-400 to-cyan-500',
			descriptionKey: 'home.features.transfer.description',
			href: '/transfer',
			details: {
				titleKey: 'features.private_note_transfers.title',
				descriptionKey: 'features.private_note_transfers.description',
				howItWorksKeys: 'features.private_note_transfers.how_it_works',
				benefitsKeys: 'features.private_note_transfers.benefits',
				useCasesKeys: 'features.private_note_transfers.use_cases'
			}
		},
		{
			id: 'merge',
			titleKey: 'home.features.merge.title',
			icon: Merge,
			gradient: 'from-orange-400 to-red-500',
			descriptionKey: 'home.features.merge.description',
			href: '/merge',
			details: {
				titleKey: 'features.deposit_merging.title',
				descriptionKey: 'features.deposit_merging.description',
				howItWorksKeys: 'features.deposit_merging.how_it_works',
				benefitsKeys: 'features.deposit_merging.benefits',
				useCasesKeys: 'features.deposit_merging.use_cases'
			}
		},
		{
			id: 'swap',
			titleKey: 'home.features.swap.title',
			icon: Shuffle,
			gradient: 'from-indigo-400 to-purple-500',
			descriptionKey: 'home.features.swap.description',
			href: '/swap',
			details: {
				titleKey: 'features.private_token_swaps.title',
				descriptionKey: 'features.private_token_swaps.description',
				howItWorksKeys: 'features.private_token_swaps.how_it_works',
				benefitsKeys: 'features.private_token_swaps.benefits',
				useCasesKeys: 'features.private_token_swaps.use_cases'
			}
		}
	];
	
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
	
	function openFeatureModal(feature: any) {
		selectedFeature = feature;
		showFeatureModal = true;
	}
	
	function closeFeatureModal() {
		showFeatureModal = false;
		selectedFeature = null;
	}
	
	function goToFeature(href: string) {
		closeFeatureModal();
		window.location.href = href;
	}

	// Reactive computed values for translation arrays
	$: howItWorksSteps = selectedFeature ? $t(selectedFeature.details.howItWorksKeys) : [];
	$: benefits = selectedFeature ? $t(selectedFeature.details.benefitsKeys) : [];
	$: useCases = selectedFeature ? $t(selectedFeature.details.useCasesKeys) : [];
</script>

<div class="mx-auto max-w-6xl p-3 sm:p-6">
	<div class="text-center mb-8 sm:mb-12">
		<div class="flex items-center justify-center gap-2 sm:gap-3 mb-6">
			<div class="relative">
				<img src="/logo.svg" alt="Privacy Pools" class="w-12 h-12 sm:w-16 sm:h-16 drop-shadow-lg" />
				<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
			</div>
			<h1 class="text-primary text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
				{$t('home.title')}
			</h1>
		</div>
		<p class="text-text-secondary text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 px-4 max-w-2xl mx-auto">
			{$t('home.subtitle')}
		</p>
		
		{#if !$isConnected}
			<div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 sm:p-8 mb-8 sm:mb-12 backdrop-blur-sm">
				<div class="flex items-center justify-center mb-4">
					<Lock class="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
					<h2 class="text-blue-800 dark:text-blue-200 text-xl sm:text-2xl font-bold">
						{$t('home.unlock_privacy')}
					</h2>
				</div>
				<p class="text-blue-700 dark:text-blue-300 text-base sm:text-lg mb-6 max-w-md mx-auto">
					{$t('home.connect_wallet_description')}
				</p>
				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					<Button text={$t('home.show_tutorial')} onClick={showOnboardingAgain} variant="outline" />
					<button
						on:click={async () => {
							const { connectWallet } = await import('$lib/stores/wallet');
							await connectWallet();
						}}
						class="button rounded bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 font-semibold"
					>
						{$t('home.connect_wallet')}
					</button>
				</div>
			</div>
		{:else}
			<!-- Main Features - Symmetrical Layout -->
			<div class="space-y-8 mb-12">
				<!-- Row 1: Deposit & Withdraw (Hero Features) -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{#each features.slice(0, 2) as feature}
						<div 
							class="group relative bg-card border border-border rounded-xl p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105 overflow-hidden"
							on:click={() => openFeatureModal(feature)}
							on:keydown={(e) => e.key === 'Enter' && openFeatureModal(feature)}
							tabindex="0"
							role="button"
						>
							<!-- Gradient Background -->
							<div class="absolute inset-0 bg-gradient-to-br {feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
							
							<!-- Content -->
							<div class="relative z-10">
								<div class="flex items-center justify-between mb-4">
									<div class="p-3 rounded-lg bg-gradient-to-br {feature.gradient} text-white shadow-lg">
										<svelte:component this={feature.icon} class="w-7 h-7" />
									</div>
									<ChevronRight class="w-5 h-5 text-text-secondary group-hover:text-primary transition-colors duration-200" />
								</div>
								
								<h3 class="font-bold text-xl mb-2 text-text group-hover:text-primary transition-colors duration-200">
									{$t(feature.titleKey)}
								</h3>
								
								<p class="text-text-secondary text-base mb-4 leading-relaxed">
									{$t(feature.descriptionKey)}
								</p>
								
								<div class="flex items-center text-primary text-sm font-medium group-hover:text-blue-600 transition-colors duration-200">
									<span>{$t('home.learn_more')}</span>
									<ChevronRight class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" />
								</div>
							</div>
							
							<!-- Animated border -->
							<div class="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-primary/20 transition-all duration-300"></div>
						</div>
					{/each}
				</div>

				<!-- Row 2: Transfer, Merge, Swap (Secondary Features) -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
					{#each features.slice(2, 5) as feature}
						<div 
							class="group relative bg-card border border-border rounded-xl p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105 overflow-hidden"
							on:click={() => openFeatureModal(feature)}
							on:keydown={(e) => e.key === 'Enter' && openFeatureModal(feature)}
							tabindex="0"
							role="button"
						>
							<!-- Gradient Background -->
							<div class="absolute inset-0 bg-gradient-to-br {feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
							
							<!-- Content -->
							<div class="relative z-10">
								<div class="flex items-center justify-between mb-4">
									<div class="p-3 rounded-lg bg-gradient-to-br {feature.gradient} text-white shadow-lg">
										<svelte:component this={feature.icon} class="w-6 h-6" />
									</div>
									<ChevronRight class="w-5 h-5 text-text-secondary group-hover:text-primary transition-colors duration-200" />
								</div>
								
								<h3 class="font-bold text-lg mb-2 text-text group-hover:text-primary transition-colors duration-200">
									{$t(feature.titleKey)}
								</h3>
								
								<p class="text-text-secondary text-sm mb-4 line-clamp-2">
									{$t(feature.descriptionKey)}
								</p>
								
								<div class="flex items-center text-primary text-sm font-medium group-hover:text-blue-600 transition-colors duration-200">
									<span>{$t('home.learn_more')}</span>
									<ChevronRight class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" />
								</div>
							</div>
							
							<!-- Animated border -->
							<div class="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-primary/20 transition-all duration-300"></div>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Enhanced Stats Section -->
			<div class="bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-xl p-6 sm:p-8 mb-10 border border-border backdrop-blur-sm">
				<div class="text-center mb-6">
					<h3 class="text-xl sm:text-2xl font-bold mb-2 text-text">
						{$t('home.stats.title')}
					</h3>
					<p class="text-text-secondary text-sm sm:text-base max-w-2xl mx-auto">
						{$t('home.stats.subtitle')}
					</p>
				</div>
				
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
					<div class="text-center group">
						<div class="flex items-center justify-center mb-4">
							<div class="p-3 rounded-full bg-green-100 dark:bg-green-900/20 group-hover:bg-green-200 dark:group-hover:bg-green-900/40 transition-colors duration-300">
								<Shield class="w-10 h-10 text-green-600 dark:text-green-400" />
							</div>
						</div>
						<span class="text-3xl sm:text-4xl font-bold text-primary block mb-2">100%</span>
						<p class="text-text-secondary font-medium">{$t('home.stats.anonymous_transactions')}</p>
					</div>
					
					<div class="text-center group">
						<div class="flex items-center justify-center mb-4">
							<div class="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/20 group-hover:bg-yellow-200 dark:group-hover:bg-yellow-900/40 transition-colors duration-300">
								<Zap class="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
							</div>
						</div>
						<span class="text-3xl sm:text-4xl font-bold text-primary block mb-2">⚡</span>
						<p class="text-text-secondary font-medium">{$t('home.stats.lightning_fast')}</p>
					</div>
					
					<div class="text-center group">
						<div class="flex items-center justify-center mb-4">
							<div class="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/40 transition-colors duration-300">
								<Users class="w-10 h-10 text-blue-600 dark:text-blue-400" />
							</div>
						</div>
						<span class="text-3xl sm:text-4xl font-bold text-primary block mb-2">∞</span>
						<p class="text-text-secondary font-medium">{$t('home.stats.decentralized')}</p>
					</div>
				</div>
			</div>

			<!-- Additional Info Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
				<!-- How It Works -->
				<div class="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow duration-300">
					<div class="flex items-center mb-4">
						<div class="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white">
							<Target class="w-5 h-5" />
						</div>
						<h3 class="text-lg font-bold text-text ml-3">{$t('home.how_it_works.title')}</h3>
					</div>
					<div class="space-y-3">
						<div class="flex items-start space-x-3">
							<div class="flex-shrink-0 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
							<p class="text-text-secondary text-sm">{$t('home.how_it_works.step1')}</p>
						</div>
						<div class="flex items-start space-x-3">
							<div class="flex-shrink-0 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
							<p class="text-text-secondary text-sm">{$t('home.how_it_works.step2')}</p>
						</div>
						<div class="flex items-start space-x-3">
							<div class="flex-shrink-0 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
							<p class="text-text-secondary text-sm">{$t('home.how_it_works.step3')}</p>
						</div>
					</div>
				</div>

				<!-- Why Choose Us -->
				<div class="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow duration-300">
					<div class="flex items-center mb-4">
						<div class="p-2 rounded-lg bg-gradient-to-br from-green-600 to-blue-600 text-white">
							<Shield class="w-5 h-5" />
						</div>
						<h3 class="text-lg font-bold text-text ml-3">{$t('home.why_choose.title')}</h3>
					</div>
					<div class="space-y-3">
						<div class="flex items-start space-x-3">
							<div class="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
							<p class="text-text-secondary text-sm">{$t('home.why_choose.privacy')}</p>
						</div>
						<div class="flex items-start space-x-3">
							<div class="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
							<p class="text-text-secondary text-sm">{$t('home.why_choose.starknet')}</p>
						</div>
						<div class="flex items-start space-x-3">
							<div class="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
							<p class="text-text-secondary text-sm">{$t('home.why_choose.decentralized')}</p>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Feature Detail Modal -->
{#if showFeatureModal && selectedFeature}
	<Modal
		show={showFeatureModal}
		title={$t(selectedFeature.details.titleKey)}
		onClose={closeFeatureModal}
		showButtons={false}
	>
		<div class="max-h-[70vh] overflow-y-auto space-y-6 pr-2">
			<!-- Header -->
			<div class="flex items-center space-x-4 p-4 bg-gradient-to-r {selectedFeature.gradient} rounded-lg text-white">
				<div class="p-3 bg-white/20 rounded-lg">
					<svelte:component this={selectedFeature.icon} class="w-8 h-8" />
				</div>
				<div>
					<h3 class="text-xl font-bold">{$t(selectedFeature.details.titleKey)}</h3>
					<p class="text-white/80">{$t(selectedFeature.details.descriptionKey)}</p>
				</div>
			</div>
			
			<!-- How It Works -->
			<div>
				<h4 class="text-lg font-semibold mb-3 flex items-center text-text">
					<Target class="w-5 h-5 mr-2 text-primary" />
					{$t('ui.modal.how_it_works')}
				</h4>
				<div class="space-y-3">
					{#each howItWorksSteps as step, index}
						<div class="flex items-start space-x-3">
							<div class="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
								{index + 1}
							</div>
							<p class="text-text-secondary">{step}</p>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Benefits -->
			<div>
				<h4 class="text-lg font-semibold mb-3 flex items-center text-text">
					<Zap class="w-5 h-5 mr-2 text-primary" />
					{$t('ui.modal.key_benefits')}
				</h4>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each benefits as benefit}
						<div class="flex items-start space-x-2 p-3 bg-surface border border-border rounded-lg">
							<p class="text-sm text-text-secondary">{benefit}</p>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Use Cases -->
			<div>
				<h4 class="text-lg font-semibold mb-3 flex items-center text-text">
					<Users class="w-5 h-5 mr-2 text-primary" />
					{$t('ui.modal.use_cases')}
				</h4>
				<div class="space-y-2">
					{#each useCases as useCase}
						<div class="flex items-start space-x-2">
							<div class="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
							<p class="text-text-secondary">{useCase}</p>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Action Buttons -->
			<div class="flex flex-col sm:flex-row gap-3 justify-center pt-4">
				<Button 
					text={`${$t('ui.modal.start_using').replace('{feature}', $t(selectedFeature.titleKey))}`}
					onClick={() => goToFeature(selectedFeature.href)}
					class_="bg-gradient-to-r {selectedFeature.gradient} text-white px-8 py-3 text-lg font-semibold"
				/>
				<button
					class="rounded bg-surface px-6 py-3 text-text hover:bg-border border border-border font-semibold"
					on:click={closeFeatureModal}
				>
					{$t('ui.modal.close')}
				</button>
			</div>
		</div>
	</Modal>
{/if}

<OnboardingGuide 
	bind:show={showOnboarding}
	onComplete={handleOnboardingComplete}
	onSkip={handleOnboardingSkip}
/>