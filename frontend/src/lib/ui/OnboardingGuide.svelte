<script lang="ts">
	import { onMount } from 'svelte';
	import { X, ArrowRight, ArrowLeft } from 'lucide-svelte';
	import Button from './Button.svelte';
	import { t } from '$lib/i18n';
	
	export let show: boolean = false;
	export let onComplete: () => void = () => {};
	export let onSkip: () => void = () => {};
	
	let currentStep = 0;
	
	$: steps = [
		{
			title: $t('ui.onboarding.welcome.title'),
			description: $t('ui.onboarding.welcome.description'),
			image: "🔒"
		},
		{
			title: $t('ui.onboarding.connect_wallet.title'),
			description: $t('ui.onboarding.connect_wallet.description'),
			image: "👛"
		},
		{
			title: $t('ui.onboarding.make_deposit.title'),
			description: $t('ui.onboarding.make_deposit.description'),
			image: "💰"
		},
		{
			title: $t('ui.onboarding.withdraw_anonymously.title'), 
			description: $t('ui.onboarding.withdraw_anonymously.description'),
			image: "🎭"
		},
		{
			title: $t('ui.onboarding.advanced_features.title'),
			description: $t('ui.onboarding.advanced_features.description'),
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
					<h2 class="text-lg font-semibold text-text">{$t('ui.onboarding.getting_started')}</h2>
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
					text={$t('ui.onboarding.skip')}
					onClick={skip}
					size="sm"
				/>
				
				<div class="flex items-center gap-2">
					{#if currentStep > 0}
						<Button
							variant="outline"
							text={$t('ui.onboarding.back')}
							onClick={prevStep}
							size="sm"
						/>
					{/if}
					
					<Button
						text={currentStep === steps.length - 1 ? $t('ui.onboarding.get_started') : $t('ui.onboarding.next')}
						onClick={nextStep}
						size="sm"
					/>
				</div>
			</div>
			
			<!-- Step counter -->
			<div class="px-6 pb-4">
				<div class="text-center text-sm text-text-secondary">
					{$t('ui.onboarding.step_counter').replace('{current}', (currentStep + 1).toString()).replace('{total}', steps.length.toString())}
				</div>
			</div>
		</div>
	</div>
{/if}