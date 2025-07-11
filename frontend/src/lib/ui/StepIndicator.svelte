<script lang="ts">
	export let steps: { label: string; description?: string }[];
	export let currentStep: number = 0;
	export let class_: string = '';
</script>

<div class="w-full {class_}">
	<div class="flex items-center">
		{#each steps as step, index}
			<div class="flex items-center">
				<!-- Step circle -->
				<div class="flex items-center justify-center">
					<div 
						class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200
						{index < currentStep 
							? 'bg-success text-white' 
							: index === currentStep 
								? 'bg-primary text-white' 
								: 'bg-surface text-text-secondary border-2 border-border'
						}"
					>
						{#if index < currentStep}
							<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{:else}
							{index + 1}
						{/if}
					</div>
				</div>
				
				<!-- Step label -->
				<div class="ml-3 min-w-0 flex-1">
					<div 
						class="text-sm font-medium transition-colors duration-200
						{index <= currentStep ? 'text-text' : 'text-text-secondary'}"
					>
						{step.label}
					</div>
					{#if step.description}
						<div 
							class="text-xs transition-colors duration-200
							{index <= currentStep ? 'text-text-secondary' : 'text-text-secondary opacity-50'}"
						>
							{step.description}
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Connector line -->
			{#if index < steps.length - 1}
				<div 
					class="flex-auto border-t-2 transition-colors duration-200 mx-4
					{index < currentStep ? 'border-success' : 'border-border'}"
				></div>
			{/if}
		{/each}
	</div>
</div>