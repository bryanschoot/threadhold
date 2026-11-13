import { describe, expect, it } from 'vitest';
import { languageFor, t } from '../src/i18n';

describe('browser language', () => {
  it.each(['en', 'en-US', 'en-GB', 'fr-FR', '', undefined])('defaults %s to English', locale => {
    expect(languageFor(locale)).toBe('en');
    if (locale !== undefined) expect(t('Save', 'Opslaan', locale)).toBe('Save');
  });
  it.each(['nl', 'nl-NL', 'nl-BE', 'NL_nl'])('supports Dutch %s', locale => {
    expect(languageFor(locale)).toBe('nl');
    expect(t('Save', 'Opslaan', locale)).toBe('Opslaan');
  });
});
