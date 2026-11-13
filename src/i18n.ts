export type UiLanguage = 'en' | 'nl';

export function languageFor(locale?: string): UiLanguage {
  return locale?.toLowerCase().split(/[-_]/)[0] === 'nl' ? 'nl' : 'en';
}

/** Browser language only; unsupported or unavailable locales default to English. */
export function t(english: string, dutch: string, locale = globalThis.navigator?.language): string {
  return languageFor(locale) === 'nl' ? dutch : english;
}
