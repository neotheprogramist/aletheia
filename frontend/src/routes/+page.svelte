<script lang="ts">
	import { onMount } from 'svelte';
	import { isConnected } from '$lib/stores/wallet';
	import OnboardingGuide from '$lib/ui/OnboardingGuide.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import { Shield, Eye, Shuffle, Merge, ArrowRightLeft, ChevronRight, Lock, Zap, Users, Target } from 'lucide-svelte';
	
	let showOnboarding = false;
	let showFeatureModal = false;
	let selectedFeature: any = null;
	
	const features = [
		{
			id: 'deposit',
			title: 'Deposit',
			icon: Shield,
			gradient: 'from-green-400 to-blue-500',
			description: 'Secure your assets with privacy',
			href: '/deposit',
			details: {
				title: 'Private Deposits',
				description: 'Transform your tokens into private notes. While your deposit can be linked to your wallet, the privacy protection kicks in when you withdraw.',
				howItWorks: [
					'Connect your wallet with supported tokens',
					'Choose the amount you want to deposit',
					'Your tokens are locked in the privacy pool',
					'You receive a private note representing your deposit',
					'The note becomes truly anonymous when you withdraw to different addresses'
				],
				benefits: [
					'🔒 Privacy protection for future withdrawals',
					'🛡️ Break the link between deposits and withdrawals',
					'⚡ Fast and secure transactions on StarkNet',
					'🌐 Decentralized - no central authority controls your funds'
				],
				useCases: [
					'Prepare funds for anonymous withdrawals later',
					'Build up privacy reserves for future transactions',
					'Store funds privately before complex DeFi operations',
					'Create anonymous spending power for business needs'
				]
			}
		},
		{
			id: 'withdraw',
			title: 'Withdraw',
			icon: Eye,
			gradient: 'from-purple-400 to-pink-500',
			description: 'Anonymous withdrawals to any address',
			href: '/withdraw',
			details: {
				title: 'Anonymous Withdrawals',
				description: 'Withdraw your funds to any address without revealing the connection to your original deposit.',
				howItWorks: [
					'Select a private note from your deposits',
					'Choose the withdrawal amount (partial or full)',
					'Specify the destination address',
					'Pay a small fee using another private note',
					'Receive funds with complete anonymity'
				],
				benefits: [
					'👤 Withdraw to any address anonymously',
					'💰 Partial withdrawals supported',
					'🔐 Zero-knowledge proofs ensure privacy',
					'⚖️ Automated fee handling',
					'🎯 Precise amount control'
				],
				useCases: [
					'Pay suppliers without revealing your main wallet',
					'Distribute funds to multiple addresses privately',
					'Cash out investments without exposing your portfolio',
					'Make anonymous donations or payments'
				]
			}
		},
		{
			id: 'transfer',
			title: 'Transfer',
			icon: ArrowRightLeft,
			gradient: 'from-blue-400 to-cyan-500',
			description: 'Private peer-to-peer transfers',
			href: '/transfer',
			details: {
				title: 'Private Note Transfers',
				description: 'Transfer funds between private notes within the privacy pool. Your note is destroyed and a new note is created for the recipient.',
				howItWorks: [
					'Select your private note as the funding source',
					'Recipient generates an empty private note and shares its hash',
					'You specify the transfer amount and recipient\'s note hash',
					'Your note is destroyed and recipient\'s note is funded',
					'Recipient can now claim their note with the transferred amount'
				],
				benefits: [
					'🤝 Direct note-to-note transfers within privacy pool',
					'👻 No on-chain link between sender and recipient',
					'🔄 Notes are validated cryptographically',
					'💸 Internal transfers with minimal fees',
					'🛡️ Complete privacy for both parties'
				],
				useCases: [
					'Send funds to other privacy pool users',
					'Pay someone without revealing your identity',
					'Transfer between your own notes for privacy',
					'Conduct private business transactions'
				]
			}
		},
		{
			id: 'merge',
			title: 'Merge',
			icon: Merge,
			gradient: 'from-orange-400 to-red-500',
			description: 'Combine deposits for better privacy',
			href: '/merge',
			details: {
				title: 'Deposit Merging',
				description: 'Combine multiple small deposits into larger ones to enhance privacy and reduce transaction costs.',
				howItWorks: [
					'Select multiple private notes of the same token',
					'Choose which deposits to merge together',
					'Pay a small merging fee',
					'Receive a single larger private note',
					'Your merged deposit has enhanced privacy'
				],
				benefits: [
					'🔀 Combine multiple small deposits',
					'💪 Stronger privacy through mixing',
					'📊 Better fund management',
					'⚡ Reduced future transaction costs',
					'🎯 Optimal deposit sizes'
				],
				useCases: [
					'Consolidate frequent small deposits',
					'Prepare large amounts for future withdrawals',
					'Optimize your private note portfolio',
					'Enhance privacy through deposit mixing'
				]
			}
		},
		{
			id: 'swap',
			title: 'Swap',
			icon: Shuffle,
			gradient: 'from-indigo-400 to-purple-500',
			description: 'Private token exchanges',
			href: '/swap',
			details: {
				title: 'Private Token Swaps',
				description: 'Exchange one token for another while maintaining complete privacy through DeFi protocols.',
				howItWorks: [
					'Select your private note as the source token',
					'Choose the target token you want to receive',
					'Set your desired swap amount',
					'Review the exchange rate and fees',
					'Receive the new token as a private note'
				],
				benefits: [
					'🔄 Anonymous token exchanges',
					'📈 Access to DeFi markets privately',
					'⚖️ Automated best price discovery',
					'🛡️ MEV protection through privacy',
					'🎯 Precise swap execution'
				],
				useCases: [
					'Rebalance your portfolio privately',
					'Swap tokens without revealing your holdings',
					'Arbitrage opportunities with privacy',
					'Convert rewards tokens anonymously'
				]
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
</script>

<div class="mx-auto max-w-6xl p-3 sm:p-6">
	<div class="text-center mb-8 sm:mb-12">
		<div class="flex items-center justify-center gap-2 sm:gap-3 mb-6">
			<div class="relative">
				<img src="/logo.svg" alt="Privacy Pools" class="w-12 h-12 sm:w-16 sm:h-16 drop-shadow-lg" />
				<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
			</div>
			<h1 class="text-primary text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
				Privacy Pools
			</h1>
		</div>
		<p class="text-text-secondary text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 px-4 max-w-2xl mx-auto">
			The ultimate privacy solution for your StarkNet transactions. Trade, transfer, and transact with complete anonymity.
		</p>
		
		{#if !$isConnected}
			<div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 sm:p-8 mb-8 sm:mb-12 backdrop-blur-sm">
				<div class="flex items-center justify-center mb-4">
					<Lock class="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
					<h2 class="text-blue-800 dark:text-blue-200 text-xl sm:text-2xl font-bold">
						Unlock Privacy
					</h2>
				</div>
				<p class="text-blue-700 dark:text-blue-300 text-base sm:text-lg mb-6 max-w-md mx-auto">
					Connect your wallet to start experiencing true financial privacy on StarkNet
				</p>
				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					<Button text="Show Tutorial" onClick={showOnboardingAgain} variant="outline" />
					<Button text="Connect Wallet" onClick={() => window.location.href = '/deposit'} />
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
				{#each features as feature}
					<div 
						class="group relative bg-card border border-border rounded-xl p-6 sm:p-8 hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-105 overflow-hidden"
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
							
							<h3 class="font-bold text-lg sm:text-xl mb-2 text-text group-hover:text-primary transition-colors duration-200">
								{feature.title}
							</h3>
							
							<p class="text-text-secondary text-sm sm:text-base mb-4 line-clamp-2">
								{feature.description}
							</p>
							
							<div class="flex items-center text-primary text-sm font-medium group-hover:text-blue-600 transition-colors duration-200">
								<span>Learn more</span>
								<ChevronRight class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" />
							</div>
						</div>
						
						<!-- Animated border -->
						<div class="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-primary/20 transition-all duration-300"></div>
					</div>
				{/each}
			</div>
			
			<!-- Stats Section -->
			<div class="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 sm:p-8 mb-8">
				<h3 class="text-center text-xl sm:text-2xl font-bold mb-6 text-text">
					Privacy-First DeFi
				</h3>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
					<div class="text-center">
						<div class="flex items-center justify-center mb-2">
							<Shield class="w-8 h-8 text-green-500 mr-2" />
							<span class="text-2xl sm:text-3xl font-bold text-primary">100%</span>
						</div>
						<p class="text-text-secondary">Anonymous Transactions</p>
					</div>
					<div class="text-center">
						<div class="flex items-center justify-center mb-2">
							<Zap class="w-8 h-8 text-yellow-500 mr-2" />
							<span class="text-2xl sm:text-3xl font-bold text-primary">⚡</span>
						</div>
						<p class="text-text-secondary">Lightning Fast</p>
					</div>
					<div class="text-center">
						<div class="flex items-center justify-center mb-2">
							<Users class="w-8 h-8 text-blue-500 mr-2" />
							<span class="text-2xl sm:text-3xl font-bold text-primary">∞</span>
						</div>
						<p class="text-text-secondary">Decentralized</p>
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
		title={selectedFeature.details.title}
		onClose={closeFeatureModal}
		singleButton={true}
		confirmText="Close"
	>
		<div class="max-h-[70vh] overflow-y-auto space-y-6 pr-2">
			<!-- Header -->
			<div class="flex items-center space-x-4 p-4 bg-gradient-to-r {selectedFeature.gradient} rounded-lg text-white">
				<div class="p-3 bg-white/20 rounded-lg">
					<svelte:component this={selectedFeature.icon} class="w-8 h-8" />
				</div>
				<div>
					<h3 class="text-xl font-bold">{selectedFeature.details.title}</h3>
					<p class="text-white/80">{selectedFeature.details.description}</p>
				</div>
			</div>
			
			<!-- How It Works -->
			<div>
				<h4 class="text-lg font-semibold mb-3 flex items-center text-text">
					<Target class="w-5 h-5 mr-2 text-primary" />
					How It Works
				</h4>
				<div class="space-y-3">
					{#each selectedFeature.details.howItWorks as step, index}
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
					Key Benefits
				</h4>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each selectedFeature.details.benefits as benefit}
						<div class="flex items-start space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
							<p class="text-sm text-text-secondary">{benefit}</p>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Use Cases -->
			<div>
				<h4 class="text-lg font-semibold mb-3 flex items-center text-text">
					<Users class="w-5 h-5 mr-2 text-primary" />
					Use Cases
				</h4>
				<div class="space-y-2">
					{#each selectedFeature.details.useCases as useCase}
						<div class="flex items-start space-x-2">
							<div class="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
							<p class="text-text-secondary">{useCase}</p>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Action Button -->
			<div class="flex justify-center pt-4">
				<Button 
					text="Start Using {selectedFeature.title}"
					onClick={() => goToFeature(selectedFeature.href)}
					class_="bg-gradient-to-r {selectedFeature.gradient} text-white px-8 py-3 text-lg font-semibold"
				/>
			</div>
		</div>
	</Modal>
{/if}

<OnboardingGuide 
	bind:show={showOnboarding}
	onComplete={handleOnboardingComplete}
	onSkip={handleOnboardingSkip}
/>