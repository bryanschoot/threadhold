# Threadhold

**Privéconcepten, direct in de bestaande Azure DevOps-commenteditor.**

Een browserextensie voor Chrome en Edge. Geen losse webapp, desktop-app, CLI of lokale server.

Status: onderzoek, implementatieplan en statische UI-schets. De browserextensie is nog niet geïmplementeerd of gepubliceerd.

## Gewenste werking

1. Open een PR en schrijf een comment in de **bestaande Azure DevOps-editor**.
2. Kies de toegevoegde knop **Opslaan als draft**. De tekst blijft lokaal in het browserprofiel; er ontstaat geen Azure DevOps-comment.
3. De opgeslagen draft verschijnt **als volledige commentkaart op dezelfde plek als gewone comments**, met **Draft · alleen voor jou** en bewerken/verwijderen. **Drafts** in de PR-header is alleen een navigatie-index.
4. Publiceer pas via de bestaande Azure DevOps-commentactie. Opslaan als draft publiceert nooit.

Dit geldt voor inline comments, algemene PR-comments en replies. Een agent voert create/read/update/delete uit via dezelfde browserbediening, met stabiele labels en draft-IDs. Er is geen afzonderlijke agent-CLI nodig; een shellagent zonder browsertoegang kan deze extensie niet bedienen.

## Bestaat dit al?

Azure DevOps documenteert gewone comment-CRUD, maar geen private draft-reviewinterface. `pending` is geen privacygarantie. VS Code- en terminaltools bieden wel lokale concepten, maar passen niet bij de gekozen browser-only workflow.

Er bestaan ook browserextensies die de Azure DevOps-reviewinterface uitbreiden. Een aantoonbaar volledige match — bestaande commenteditor uitbreiden met duurzame private drafts én browser-agent-CRUD — is in dit onderzoek niet vastgesteld. Dat is geen bewijs dat die nergens bestaat.

## Documenten

- [Onderzoek en bestaande oplossingen](docs/research.md)
- [Technische aanpak en implementatieplan](docs/implementation-plan.md)
- [UI-schets in de Azure DevOps-commenteditor](.lavish/product-plan.html) — statisch, fictieve data; GitHub toont HTML-broncode.

## Naam en privacy

**Threadhold**: houd reviewthreads vast tot je ze wilt publiceren. Repository: `bryanschoot/threadhold`, privé aangemaakt. Domein en merkrechten zijn niet gereserveerd of juridisch onderzocht.

Concepten worden volgens het ontwerp in de extensie-origin van het lokale browserprofiel opgeslagen: niet in Azure DevOps, niet in website-localStorage, niet in Git en niet via browsersync. Dit is geen encryptie- of sandboxgarantie. Op de pagina getoonde tekst is zichtbaar voor scripts met toegang tot die pagina. Een extensie verwijderen of een profiel verliezen kan ook drafts verwijderen.
