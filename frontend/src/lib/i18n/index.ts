import { init, register, locale, t } from 'svelte-i18n';
import { writable } from 'svelte/store';

// Dostępne języki
export const availableLanguages = {
	en: { name: 'English', flag: '🇺🇸' },
	fr: { name: 'Français', flag: '🇫🇷' },
	de: { name: 'Deutsch', flag: '🇩🇪' },
	es: { name: 'Español', flag: '🇪🇸' },
	he: { name: 'עברית', flag: '🇮🇱' },
	pl: { name: 'Polski', flag: '🇵🇱' }
};

// Store dla aktualnego języka
export const currentLanguage = writable('en');

// Rejestracja języków
register('en', () => import('./locales/en.json'));
register('fr', () => import('./locales/fr.json'));
register('de', () => import('./locales/de.json'));
register('es', () => import('./locales/es.json'));
register('he', () => import('./locales/he.json'));
register('pl', () => import('./locales/pl.json'));

// Funkcja do wykrywania języka przeglądarki
function detectBrowserLanguage(): string {
	if (typeof window === 'undefined') return 'en';
	
	const browserLang = navigator.language || navigator.languages?.[0] || 'en';
	const langCode = browserLang.split('-')[0];
	
	// Sprawdź czy mamy ten język w dostępnych
	if (langCode in availableLanguages) {
		return langCode;
	}
	
	return 'en'; // fallback
}

// Funkcja do zmiany języka
export function changeLanguage(lang: string) {
	if (lang in availableLanguages) {
		locale.set(lang);
		currentLanguage.set(lang);
		
		// Zapisz w localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('aletheia-language', lang);
		}
	}
}

// Inicjalizacja i18n
export function initI18n() {
	let initialLocale = 'en';
	
	if (typeof window !== 'undefined') {
		// Sprawdź localStorage
		const savedLang = localStorage.getItem('aletheia-language');
		if (savedLang && savedLang in availableLanguages) {
			initialLocale = savedLang;
		} else {
			// Wykryj język przeglądarki
			initialLocale = detectBrowserLanguage();
		}
	}
	
	init({
		fallbackLocale: 'en',
		initialLocale
	});
	
	// Ustaw locale natychmiast dla SSR
	locale.set(initialLocale);
	currentLanguage.set(initialLocale);
}

// Inicjalizuj od razu dla SSR
initI18n();

// Eksportuj funkcję t dla wygody
export { t };