import { browser } from 'wxt/browser';
import { languageFor, t } from '../../src/i18n';
import './style.css';

const form = document.querySelector<HTMLFormElement>('#access')!;
const input = document.querySelector<HTMLInputElement>('#host')!;
const list = document.querySelector<HTMLUListElement>('#hosts')!;
const status = document.querySelector<HTMLElement>('#status')!;
document.documentElement.lang = languageFor(globalThis.navigator?.language);
const localizedText: [string, string][] = [
  ['intro', t('Local drafts in your Azure DevOps comment editor. No PAT, server or browser sync.', 'Lokale drafts in je Azure DevOps-commenteditor. Geen PAT, server of browsersync.')],
  ['host-label', t('Azure DevOps host', 'Azure DevOps-host')],
  ['host-hint', t('dev.azure.com or yourorganization.visualstudio.com. Only this host gets access.', 'dev.azure.com of jouworganisatie.visualstudio.com. Alleen deze host krijgt toegang.')],
  ['grant-access', t('Grant access', 'Toegang geven')],
  ['hosts-heading', t('Active hosts', 'Actieve hosts')],
  ['privacy-hint', t('Refresh an open PR after installation or an extension update. Draft text is local, but page code can read it on the page. Removing the extension may erase drafts.', 'Ververs een al geopende PR na installatie of een extensie-update. Drafttekst is lokaal, maar op de pagina leesbaar voor paginacode. Verwijderen van de extensie kan drafts wissen.')],
];
for (const [id, text] of localizedText) document.getElementById(id)!.textContent = text;
async function syncRegistration() {
  const result: { ok: boolean; error?: string } = await browser.runtime.sendMessage({ channel: 'threadhold-access' });
  if (!result?.ok) throw new Error(result?.error ?? t('Script registration is unavailable.', 'Scriptregistratie niet bereikbaar.'));
}
function report(message: string, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}
async function renderHosts() {
  const permissions = await browser.permissions.getAll();
  list.replaceChildren();
  const origins = permissions.origins ?? [];
  for (const origin of origins) {
    const host = new URL(origin).hostname;
    const item = document.createElement('li');
    item.append(host);
    const remove = document.createElement('button');
    remove.textContent = t('Revoke access', 'Toegang intrekken');
    remove.addEventListener('click', async () => {
      try {
        await browser.permissions.remove({ origins: [origin] });
        await syncRegistration();
        await renderHosts();
        report(t('Access revoked. Refresh open tabs to remove existing controls. Local drafts are retained.', 'Toegang ingetrokken. Ververs geopende tabs om bestaande controls te verwijderen. Lokale drafts blijven bewaard.'));
      } catch (error) { report(t(`Failed to revoke access: ${String(error)}`, `Toegang intrekken mislukt: ${String(error)}`), true); }
    });
    item.append(remove);
    list.append(item);
  }
  if (!origins.length) list.textContent = t('No access granted yet.', 'Nog geen toegang verleend.');
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const host = input.value.trim().toLowerCase();
  if (host !== 'dev.azure.com' && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.visualstudio\.com$/.test(host)) {
    report(t('Use dev.azure.com or a specific organization.visualstudio.com host.', 'Gebruik dev.azure.com of een concrete organisatie.visualstudio.com-host.'), true);
    return;
  }
  try {
    const origin = `https://${host}/*`;
    const granted = await browser.permissions.request({ origins: [origin] });
    if (!granted) { report(t('Access was not granted.', 'Geen toegang verleend.')); return; }
    await syncRegistration();
    await renderHosts();
    report(t('Access is active. Open or refresh your Azure DevOps PR to load Threadhold.', 'Toegang actief. Open of ververs je Azure DevOps-PR om Threadhold te laden.'));
  } catch (error) { report(t(`Failed to set up access: ${String(error)}`, `Toegang instellen mislukt: ${String(error)}`), true); }
});
void renderHosts().catch((error: unknown) => report(t(`Failed to load hosts: ${String(error)}`, `Hosts laden mislukt: ${String(error)}`), true));
