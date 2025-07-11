<script lang="ts">
	import { onMount } from 'svelte';
	import { X, ArrowRight, ArrowLeft } from 'lucide-svelte';
	import Button from './Button.svelte';
	
	export let show: boolean = false;
	export let onComplete: () => void = () => {};
	export let onSkip: () => void = () => {};
	
	let currentStep = 0;
	
	const steps = [
		{
			title: "Welcome to Privacy Pools!",
			description: "A decentralized privacy protocol that lets you deposit, withdraw, and transfer tokens while maintaining anonymity.",
			image: "🔒"
		},
		{
			title: "Connect Your Wallet",
			description: "First, connect your StarkNet wallet to start using Privacy Pools. We support Argent X and Braavos wallets.",
			image: "👛"
		},
		{
			title: "Make a Deposit",
			description: "Deposit tokens into the privacy pool. This creates a private note that only you can access with your secret.",
			image: "💰"
		},
		{
			title: "Withdraw Anonymously", 
			description: "Withdraw to any address without revealing the connection to your deposit. Fees are automatically handled.",
			image: "🎭"
		},
		{
			title: "Advanced Features",
			description: "Use Merge to combine deposits, Transfer to send privately, or Swap for DeFi interactions.",
			image: "⚡"
		}
	];
	
	function nextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
		} else {
			complete();
		}
	}
	
	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}
	
	function complete() {
		show = false;
		onComplete();
	}
	
	function skip() {
		show = false;
		onSkip();
	}
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="mx-4 w-full max-w-md rounded-lg bg-card border border-border shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-border">
				<div class="flex items-center gap-2">
					<span class="text-2xl">{steps[currentStep].image}</span>
					<h2 class="text-lg font-semibold text-text">Getting Started</h2>
				</div>
				<button 
					class="rounded-lg p-1 text-text-secondary hover:text-text hover:bg-surface transition-colors"
					on:click={skip}
				>
					<X size={20} />
				</button>
			</div>
			
			<!-- Content -->
			<div class="p-6">
				<div class="text-center mb-6">
					<h3 class="text-xl font-bold text-text mb-3">
						{steps[currentStep].title}
					</h3>
					<p class="text-text-secondary leading-relaxed">
						{steps[currentStep].description}
					</p>
				</div>
				
				<!-- Progress indicators -->
				<div class="flex justify-center gap-2 mb-6">
					{#each steps as _, index}
						<div 
							class="w-2 h-2 rounded-full transition-colors
							{index === currentStep ? 'bg-primary' : 'bg-border'}"
						></div>
					{/each}
				</div>
			</div>
			
			<!-- Footer -->
			<div class="flex items-center justify-between p-6 border-t border-border">
				<Button
					variant="outline"
					text="Skip"
					onClick={skip}
					size="sm"
				/>
				
				<div class="flex items-center gap-2">
					{#if currentStep > 0}
						<Button
							variant="outline"
							text="Back"
							onClick={prevStep}
							size="sm"
						/>
					{/if}
					
					<Button
						text={currentStep === steps.length - 1 ? "Get Started" : "Next"}
						onClick={nextStep}
						size="sm"
					/>
				</div>
			</div>
			
			<!-- Step counter -->
			<div class="px-6 pb-4">
				<div class="text-center text-sm text-text-secondary">
					Step {currentStep + 1} of {steps.length}
				</div>
			</div>
		</div>
	</div>
{/if}