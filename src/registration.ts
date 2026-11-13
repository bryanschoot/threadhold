import { browser } from 'wxt/browser';

/** Registers only concrete granted hosts; never expands the optional legacy wildcard. */
export async function syncContentScripts(): Promise<void> {
  const permissions = await browser.permissions.getAll();
  const registrations = (permissions.origins ?? []).flatMap(origin => {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || (url.hostname !== 'dev.azure.com' && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.visualstudio\.com$/.test(url.hostname))) return [];
    const id = `threadhold-${url.hostname.replaceAll('.', '-')}`;
    const common = { matches: [`${url.origin}/*`], allFrames: false, persistAcrossSessions: true };
    return [
      { ...common, id, js: ['content-scripts/content.js'], css: ['content-scripts/content.css'], runAt: 'document_idle' as const, world: 'ISOLATED' as const },
      { ...common, id: `${id}-monaco`, js: ['content-scripts/monaco.js'], runAt: 'document_start' as const, world: 'MAIN' as const },
    ];
  });
  const existing = await browser.scripting.getRegisteredContentScripts();
  const obsolete = existing.filter(item => item.id.startsWith('threadhold-') && !registrations.some(registration => registration.id === item.id)).map(item => item.id);
  if (obsolete.length) await browser.scripting.unregisterContentScripts({ ids: obsolete });
  for (const registration of registrations) {
    if (existing.some(item => item.id === registration.id)) await browser.scripting.updateContentScripts([registration]);
    else await browser.scripting.registerContentScripts([registration]);
  }
}
