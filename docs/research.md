# Onderzoek: browserextensie voor Azure DevOps-draftcomments

Onderzoeksdatum: 13 november 2026. De gebruiker heeft de vorm expliciet gekozen: **alleen een browserextensie die de bestaande Azure DevOps-commenteditor uitbreidt**. Geen losse review-app of CLI.

## Antwoord

**Niet native aangetoond; extern bestaan deeloplossingen.** In de onderzochte publieke Azure DevOps-contracten is geen private draft-commentresource met CRUD en een afzonderlijke submit-reviewoperatie aangetroffen. VS Code- en terminaltools bieden wel lokale drafts. Ook bestaan browserextensies voor Azure DevOps-reviews, maar de volledige gevraagde combinatie is in de onderzochte bronnen niet vastgesteld. Dit is geen bewijs van universele afwezigheid.

## Native mogelijkheden

Microsoft documenteert comments, replies, edit/delete en votes. De handleiding laat de bestaande inline editor zien: tekst invoeren, daarna **Comment** kiezen. Een draft PR betreft de PR zelf, niet een privéreview van één reviewer. [Reviewhandleiding](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops), [draft PR](https://learn.microsoft.com/en-us/azure/devops/repos/git/pull-requests?view=azure-devops#create-draft-prs).

De threadstatus `pending` betekent: “The issue in this comment is under review and awaits something else.” Geen privacy- of publicatiestatus. [Commentstatus](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops#change-comment-status).

REST 7.1 biedt thread create/get/list/update en comment create/get/list/update/delete. Het model bevat `publishedDate`, `status`, `properties`, context en `isDeleted`, maar geen expliciete draft/private visibility. `properties` is geen toegangscontrole; delete is soft deletion. [Threads](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads?view=azure-devops-rest-7.1), [comments](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments?view=azure-devops-rest-7.1), [modellen](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1).

Een zoekresultaat beweerde dat **Save all comments** een native private-reviewworkflow oplevert. Deze claim is **niet overgenomen**: de geraadpleegde Microsoft-handleiding beschrijft die functie niet en documenteert geen bijbehorende private resource. Onverzonden editortekst is evenmin een bewezen duurzaam agent-CRUD-contract.

## Browseralternatieven

| Oplossing | Aangetoonde functie | Niet aangetoond |
| --- | --- | --- |
| DevOps PR View | Browserextensie met aanvullende fullscreenknoppen, codezoom, comment-highlights en scrollverbeteringen | Duurzame private draftcomment-CRUD |
| Markdown PR — Azure DevOps PR Comments | Commenten op gerenderde Markdown, inline threads, replies en edit/delete; gebruikt volgens de listing de bestaande sessie | Algemene duurzame draftlaag op alle native commenteditors met agent-CRUD |
| assist | Browserknoppen voor agentworkflows; Azure DevOps checkout en address-comments | Browser-only private draftcomment-CRUD zonder lokale server |

[DevOps PR View: README en broncode](https://github.com/unimorphic/DevOpsPrView), [Markdown PR: Web Store](https://chromewebstore.google.com/detail/markdown-pr-%E2%80%94-azure-devop/habbfnkhgmnkhlbakjlnapadamjijbdh), [Markdown PR: broncode](https://github.com/chienyuanchang/rich-diff-comments), [assist: eigen documentatie](https://staffordwilliams.com/assist/browser-extension/).

Markdown PR vermeldt “without closing drafts” bij themewissels. Dat bewijst behoud van open editorstate, niet zelfstandig de gevraagde persistente create/read/update/delete-lifecycle na browserherstart. De listing is niet live functioneel getest.

## Andere omgevingen: bestaan wel, passen niet bij de keuze

| Oplossing | Bevinding |
| --- | --- |
| vscode-pr-azdo | Lokale draftcomments en replies; UI-edit/delete/publicatie; agent-create via VS Code language-modeltools. Volledige agent-list/update/delete niet vastgesteld |
| pr-review-ai | Interne `DraftCommentManager` met list/add/edit/remove/clearAll en lokale persistentie; geen externe agent-CRUD-interface vastgesteld |
| tuicr | Agentgerichte JSON-CLI met create/read/delete en lokale sessies; aparte update niet gedocumenteerd |
| Microsoft Azure DevOps MCP / ado-axi | Tools voor gewone Azure DevOps-comments; geen private conceptbackend aangetroffen |

[vscode-pr-azdo](https://github.com/vinaychandra/vscode-pr-azdo), [agenttoolregistratie](https://github.com/vinaychandra/vscode-pr-azdo/blob/HEAD/src/chat/copilotReviewTools.ts), [pr-review-ai CRUD](https://github.com/Munikumar09/pr-review-ai/blob/HEAD/src/review/DraftCommentManager.ts), [tuicr CLI](https://github.com/agavra/tuicr/blob/HEAD/docs/REVIEW_CLI.md), [tuicr Azure-beperkingen](https://github.com/agavra/tuicr/blob/HEAD/docs/AZURE.md), [Microsoft remote MCP](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops#repos), [ado-axi PR-broncode](https://github.com/jeffreyhaen/ado-axi/blob/main/src/commands/pr.ts).

Belangrijk: tuicr documenteert dat `:submit draft` bij Azure DevOps gewone publicatie is. Dat commando is dus geen veilig alternatief voor lokale opslag.

## Browserplatform: onderbouwing

- Content scripts kunnen de DOM lezen/uitbreiden en berichten naar de extensie sturen. Hun JavaScript draait standaard geïsoleerd, maar de DOM is gedeeld. Geen automatische privacygarantie voor tekst die op de pagina wordt getoond. [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- Web-storagegebruik vanuit een content script benadert de website-origin, niet de extensie-origin. IndexedDB in de extension service worker is wel extensieopslag; IndexedDB is daar beschikbaar. Daarom geen `window.localStorage` of page-origin IndexedDB voor drafts. [Storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).
- `chrome.storage.local` is lokaal; `sync` kan gegevens tussen browsers synchroniseren. Lokale data verdwijnt bij het verwijderen van de extensie. Gebruik `storage.local` alleen voor kleine instellingen; IndexedDB-transacties voor draftrevisies en meerdere tabs. [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Service workers kunnen stoppen; duurzame state hoort niet alleen in globals. [Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Risico's voor uitgestelde publicatie

Inline feedback gebruikt side, posities, diff-iteraties en `changeTrackingId`; een oud regelnummer opnieuw gebruiken kan de verkeerde code aanwijzen. De definitie noemt 1-based regels en 0-based offsets; effectieve selectie moet gericht worden bewezen. [Threadmodellen](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1), [iteration changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1).

Een comment kan al gepubliceerd zijn wanneer een client een fout of timeout ziet. De onderzochte createcontracten documenteren geen exactly-once-garantie of atomaire batchreview. **[INFERENCE]** blind opnieuw publiceren kan duplicaten opleveren. Service hooks kunnen inhoud al doorgeven; publiceren en daarna verwijderen is geen private draft. [Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1), [comment-event](https://learn.microsoft.com/en-us/azure/devops/service-hooks/events?view=azure-devops#pull-request-commented-on).

## Ontwerpconsequentie en hergebruik

Bouw een smalle Manifest V3-browserextensie die de bestaande commenteditor behoudt en draftcontrols toevoegt. Conceptdata blijft in extensieopslag. De bestaande Azure DevOps-publicatiestap blijft expliciet en afzonderlijk; geen eigen authbackend of algemene PR-client.

De eerdere tuicr-uitbreidingsroute vervalt: die voldoet niet aan browser-only. Bestaande browserextensies zijn referenties voor DOM-integratie, geen bewezen vervanging. Controleer hun actuele licentie en onderhoudsstatus vóór codeovername; nu is geen broncode gekopieerd of geforkt.

## Onderzoeksgrenzen

Geen ingelogde tenantinspectie, extensie-installatie, multi-user privacyproef of live Azure DevOps-mutatie. Openbare standaardbranches kunnen afwijken van uitgebrachte versies. Exacte actuele DOM-selectors, accountcontext, sessiegedrag en native submit-successdetectie moeten vóór implementatie in een toegestane omgeving worden onderzocht. De UI-schets is gebaseerd op Microsoft's gepubliceerde editorafbeelding, niet op een live capture van de gebruiker.
