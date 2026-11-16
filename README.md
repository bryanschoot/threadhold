# Threadhold

**Privéconcepten, direct in de bestaande Azure DevOps-commenteditor.**

Een browserextensie voor Chrome en Edge. Geen losse webapp, desktop-app, CLI of lokale server.

Status: werkende unpacked Chrome/Edge-extensie. Geen gepubliceerde browserstorelisting.

De interface volgt de browsertaal: Engels standaard, Nederlands voor `nl`-locales. Andere talen vallen terug op Engels. De onderstaande instructies gebruiken Nederlandse labels; bijvoorbeeld **Save as draft**, **Edit**, **Save** en **Publish drafts** in een Engelse browser.

## Werking

1. Schrijf in de **bestaande Azure DevOps-commenteditor** en kies **Opslaan als draft**.
2. De bevestigde draft verschijnt tussen de gewone comments, met native typografie, avatar, een kleine **Draft**-badge en bewerk-/verwijdericonen. Geen extra tab.
3. Het potlood opent dezelfde native editor. **Opslaan** en Ctrl+Enter bewaren de wijziging lokaal; **Cancel** behoudt de laatst opgeslagen versie.
4. Alleen **Drafts plaatsen (n)** naast **Approve** publiceert opgeslagen drafts, na bevestiging. De gewone, niet aan een draft gekoppelde Azure DevOps-commentacties blijven ongewijzigd.

Dit geldt voor inline comments, algemene PR-comments en replies. Een agent voert create/read/update/delete uit via dezelfde browserbediening, met stabiele labels en draft-IDs. Er is geen afzonderlijke agent-CLI nodig; een shellagent zonder browsertoegang kan deze extensie niet bedienen.

Open **Draft help / Drafthulp** naast de PR-acties voor de ingebouwde browseragentinstructies, opslagbevestiging en de grens tussen lokale drafts en publicatie. De hulp werkt ook zonder repositorykennis.

## Bestaat dit al?

Azure DevOps documenteert gewone comment-CRUD, maar geen private draft-reviewinterface. `pending` is geen privacygarantie. VS Code- en terminaltools bieden wel lokale concepten, maar passen niet bij de gekozen browser-only workflow.

Er bestaan ook browserextensies die de Azure DevOps-reviewinterface uitbreiden. Een aantoonbaar volledige match — bestaande commenteditor uitbreiden met duurzame private drafts én browser-agent-CRUD — is in dit onderzoek niet vastgesteld. Dat is geen bewijs dat die nergens bestaat.

## Documenten

- [Onderzoek en bestaande oplossingen](docs/research.md)
- [Technische aanpak en implementatieplan](docs/implementation-plan.md)
- [Installeren, bedienen en privacy](docs/installatie.md)

## Naam en privacy

**Threadhold**: houd reviewthreads vast tot je ze wilt publiceren. Repository: `bryanschoot/threadhold`, privé aangemaakt. Domein en merkrechten zijn niet gereserveerd of juridisch onderzocht.

Concepten staan in IndexedDB in de extensie-origin van het lokale browserprofiel: niet als Azure DevOps-comment, niet in website-localStorage, niet in Git en niet via browsersync. Dit is geen encryptie- of sandboxgarantie. Op de pagina getoonde tekst is zichtbaar voor scripts met toegang tot die pagina. Een extensie verwijderen of een profiel verliezen kan ook drafts verwijderen.
