export interface ErrorMapping {
	pattern: RegExp;
	message: string;
	solution?: string;
}

export const errorMappings: ErrorMapping[] = [
	{
		pattern: /Transaction reverted/i,
		message: 'Transakcja została odrzucona przez sieć',
		solution: 'Sprawdź saldo i spróbuj ponownie z niższą kwotą'
	},
	{
		pattern: /insufficient funds/i,
		message: 'Niewystarczające środki na koncie',
		solution: 'Doładuj portfel lub zmniejsz kwotę transakcji'
	},
	{
		pattern: /invalid proof/i,
		message: 'Nieprawidłowy dowód kryptograficzny',
		solution: 'Spróbuj ponownie lub odśwież stronę'
	},
	{
		pattern: /network error/i,
		message: 'Błąd połączenia z siecią',
		solution: 'Sprawdź połączenie internetowe i spróbuj ponownie'
	},
	{
		pattern: /timeout/i,
		message: 'Przekroczono limit czasu operacji',
		solution: 'Operacja trwa zbyt długo - spróbuj ponownie'
	},
	{
		pattern: /user rejected/i,
		message: 'Transakcja została odrzucona przez użytkownika',
		solution: 'Potwierdź transakcję w portfelu, aby kontynuować'
	},
	{
		pattern: /failed to fetch/i,
		message: 'Nie udało się pobrać danych',
		solution: 'Sprawdź połączenie internetowe i spróbuj ponownie'
	},
	{
		pattern: /invalid address/i,
		message: 'Nieprawidłowy adres portfela',
		solution: 'Sprawdź poprawność adresu odbiorcy'
	},
	{
		pattern: /invalid amount/i,
		message: 'Nieprawidłowa kwota',
		solution: 'Wprowadź poprawną kwotę (większą od 0)'
	},
	{
		pattern: /gas estimation failed/i,
		message: 'Nie udało się oszacować kosztów transakcji',
		solution: 'Sprawdź parametry transakcji i spróbuj ponownie'
	}
];

export interface ProcessedError {
	message: string;
	solution?: string;
	originalError: string;
	type: 'user' | 'network' | 'system';
}

export function processError(error: any): ProcessedError {
	const errorString = error?.message || error?.toString() || 'Nieznany błąd';
	
	// Try to match with known error patterns
	for (const mapping of errorMappings) {
		if (mapping.pattern.test(errorString)) {
			return {
				message: mapping.message,
				solution: mapping.solution,
				originalError: errorString,
				type: getErrorType(mapping.pattern)
			};
		}
	}
	
	// Default fallback for unknown errors
	return {
		message: 'Wystąpił nieoczekiwany błąd',
		solution: 'Spróbuj ponownie lub skontaktuj się z pomocą techniczną',
		originalError: errorString,
		type: 'system'
	};
}

function getErrorType(pattern: RegExp): 'user' | 'network' | 'system' {
	const patternString = pattern.toString();
	
	if (patternString.includes('rejected') || patternString.includes('invalid')) {
		return 'user';
	}
	
	if (patternString.includes('network') || patternString.includes('timeout') || patternString.includes('fetch')) {
		return 'network';
	}
	
	return 'system';
}

export function getErrorIcon(type: 'user' | 'network' | 'system'): string {
	switch (type) {
		case 'user':
			return '👤';
		case 'network':
			return '🌐';
		case 'system':
			return '⚙️';
		default:
			return '❌';
	}
}