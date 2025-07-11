<script lang="ts">
	import { processError, getErrorIcon, type ProcessedError } from '$lib/utils/errorHandler';
	
	export let error: any = null;
	export let compact = false;
	export let showDetails = false;
	
	let processedError: ProcessedError | null = null;
	let showOriginalError = false;
	
	$: if (error) {
		processedError = processError(error);
	} else {
		processedError = null;
	}
	
	function toggleDetails() {
		showOriginalError = !showOriginalError;
	}
</script>

{#if processedError}
	<div class="error-display" class:compact>
		<div class="error-header">
			<span class="error-icon">
				{getErrorIcon(processedError.type)}
			</span>
			<div class="error-content">
				<div class="error-message">
					{processedError.message}
				</div>
				{#if processedError.solution}
					<div class="error-solution">
						💡 {processedError.solution}
					</div>
				{/if}
			</div>
		</div>
		
		{#if showDetails}
			<div class="error-actions">
				<button
					type="button"
					class="details-button"
					on:click={toggleDetails}
				>
					{showOriginalError ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
				</button>
			</div>
			
			{#if showOriginalError}
				<div class="error-details">
					<div class="details-label">Szczegóły techniczne:</div>
					<div class="details-content">
						{processedError.originalError}
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.error-display {
		background: rgba(var(--color-error-rgb), 0.1);
		border: 1px solid var(--color-error);
		border-radius: 8px;
		padding: 16px;
		margin: 12px 0;
		color: var(--color-error);
	}
	
	.error-display.compact {
		padding: 12px;
		margin: 8px 0;
	}
	
	.error-header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	
	.error-icon {
		font-size: 20px;
		flex-shrink: 0;
		margin-top: 2px;
	}
	
	.error-content {
		flex: 1;
	}
	
	.error-message {
		font-weight: 600;
		margin-bottom: 8px;
		line-height: 1.4;
	}
	
	.error-solution {
		font-size: 14px;
		color: var(--color-text);
		background: rgba(var(--color-warning-rgb), 0.1);
		border: 1px solid var(--color-warning);
		border-radius: 6px;
		padding: 8px 12px;
		margin-top: 8px;
	}
	
	.error-actions {
		margin-top: 12px;
		text-align: right;
	}
	
	.details-button {
		background: none;
		border: none;
		color: var(--color-error);
		cursor: pointer;
		text-decoration: underline;
		font-size: 12px;
		padding: 4px 0;
	}
	
	.details-button:hover {
		color: var(--color-error-dark);
	}
	
	.error-details {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgba(var(--color-error-rgb), 0.2);
	}
	
	.details-label {
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 6px;
		color: var(--color-text-secondary);
	}
	
	.details-content {
		font-size: 11px;
		font-family: monospace;
		background: rgba(var(--color-surface-rgb), 0.5);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 8px;
		color: var(--color-text-secondary);
		word-break: break-all;
		line-height: 1.3;
	}
	
	/* Responsive */
	@media (max-width: 768px) {
		.error-display {
			padding: 12px;
		}
		
		.error-header {
			gap: 8px;
		}
		
		.error-icon {
			font-size: 18px;
		}
		
		.error-message {
			font-size: 14px;
		}
		
		.error-solution {
			font-size: 13px;
			padding: 6px 10px;
		}
	}
</style>