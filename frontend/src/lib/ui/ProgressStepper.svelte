<script lang="ts">
	export let steps: string[] = [];
	export let currentStep = 0;
	export let loading = false;
	export let error = false;
	export let errorStep = -1;

	function getStepStatus(index: number) {
		if (error && index === errorStep) return 'error';
		if (index < currentStep) return 'completed';
		if (index === currentStep) return loading ? 'loading' : 'active';
		return 'pending';
	}

	function getStepIcon(index: number) {
		const status = getStepStatus(index);
		switch (status) {
			case 'completed':
				return '✓';
			case 'error':
				return '✗';
			case 'loading':
				return '';
			default:
				return (index + 1).toString();
		}
	}
</script>

<div class="progress-stepper">
	<div class="stepper-header">
		<div class="stepper-track">
			{#each steps as step, index}
				<div class="stepper-step" class:active={index === currentStep} class:completed={index < currentStep} class:error={error && index === errorStep}>
					<div class="step-indicator">
						{#if getStepStatus(index) === 'loading'}
							<div class="step-spinner"></div>
						{:else}
							<span class="step-icon">{getStepIcon(index)}</span>
						{/if}
					</div>
					
					{#if index < steps.length - 1}
						<div class="step-connector" class:completed={index < currentStep}></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
	
	<div class="stepper-content">
		<div class="step-labels">
			{#each steps as step, index}
				<div class="step-label" class:active={index === currentStep} class:completed={index < currentStep} class:error={error && index === errorStep}>
					{step}
				</div>
			{/each}
		</div>
		
		{#if currentStep < steps.length}
			<div class="current-step-description">
				{#if error && currentStep === errorStep}
					<span class="error-message">Error at step: {steps[currentStep]}</span>
				{:else if loading}
					<span class="loading-message">Processing: {steps[currentStep]}</span>
				{:else}
					<span class="step-message">Current step: {steps[currentStep]}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.progress-stepper {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
	}

	.stepper-header {
		margin-bottom: 16px;
	}

	.stepper-track {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.stepper-step {
		display: flex;
		align-items: center;
		position: relative;
	}

	.step-indicator {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-border);
		border: 2px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		font-weight: 600;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.stepper-step.active .step-indicator {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.stepper-step.completed .step-indicator {
		background: var(--color-success);
		border-color: var(--color-success);
		color: white;
	}

	.stepper-step.error .step-indicator {
		background: var(--color-error);
		border-color: var(--color-error);
		color: white;
	}

	.step-connector {
		width: 60px;
		height: 2px;
		background: var(--color-border);
		transition: all 0.2s ease;
	}

	.step-connector.completed {
		background: var(--color-success);
	}

	.step-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.stepper-content {
		text-align: center;
	}

	.step-labels {
		display: flex;
		justify-content: center;
		gap: 60px;
		margin-bottom: 12px;
	}

	.step-label {
		font-size: 12px;
		color: var(--color-text-secondary);
		font-weight: 500;
		min-width: 36px;
		text-align: center;
	}

	.step-label.active {
		color: var(--color-primary);
		font-weight: 600;
	}

	.step-label.completed {
		color: var(--color-success);
	}

	.step-label.error {
		color: var(--color-error);
	}

	.current-step-description {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--color-border);
	}

	.step-message {
		font-size: 14px;
		color: var(--color-text);
	}

	.loading-message {
		font-size: 14px;
		color: var(--color-primary);
		font-weight: 500;
	}

	.error-message {
		font-size: 14px;
		color: var(--color-error);
		font-weight: 500;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.stepper-track {
			flex-direction: column;
			gap: 12px;
		}

		.step-connector {
			width: 2px;
			height: 30px;
			transform: rotate(90deg);
		}

		.step-labels {
			flex-direction: column;
			gap: 12px;
		}

		.step-label {
			min-width: unset;
		}
	}
</style>