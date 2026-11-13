# Threadhold — browserextensie en implementatie

## Productcontract

Uitsluitend een Chrome/Edge-extensie in de bestaande Azure DevOps-PR. Geen aparte review-app, CLI, MCP-server, lokale server of desktopproces.

- **Create:** native editor openen, schrijven, **Opslaan als draft**.
- **Read:** volledige draft tussen de gewone comments; geen extra tab of index.
- **Update:** potlood opent de native editor. **Opslaan** en Ctrl+Enter blijven lokaal. Het ID blijft gelijk, de revisie stijgt. **Cancel** bewaart de laatst opgeslagen versie.
- **Delete:** prullenbak met bevestiging; alleen lokale opslag.
- **Publiceren:** **Drafts plaatsen (n)** naast **Approve**, met expliciete bevestiging. Geen automatische approve of resolve.

Algemene PR-comments, replies op bestaande threads en inline comments met meerregelige selecties vallen binnen dit contract. Een draft is geen servercomment met `pending`-status. Gepubliceerde comments wijzigen of verwijderen valt erbuiten.

## UI

Draftkaarten hergebruiken de native commentstructuur en Azure DevOps-klassen: avatar, auteur, tijd, Markdown-bodygebied en bewerk-/verwijdericonen rechtsboven. Alleen een kleine **Draft**-badge onderscheidt de lokale kaart. De editor, toolbar, mentions en preview blijven van Azure DevOps.

Tijdens draftbewerking verdwijnt de leeskaart en worden native publicatieknoppen verborgen. De lokale **Opslaan**-actie vervangt die handeling; ook Ctrl+Enter wordt uitsluitend binnen die draftbewerking lokaal afgehandeld. Niet-gekoppelde native editors blijven ongewijzigd.

De editor sluit pas na bevestigde opslag. Opslagfouten of revisieconflicten bewaren de editortekst. Een draft mag geen andere aanwezige editorinhoud overschrijven. Niet-gemounte of verouderde locaties blijven leesbaar als herstelkaart tussen de Overview-comments.

## Technische indeling

| Onderdeel | Keuze en verantwoordelijkheid |
| --- | --- |
| Platform | Manifest V3, WXT, TypeScript; Chrome/Edge 124+ |
| Content script | Geïsoleerde wereld; native controls en draftkaarten |
| Editoradapter | DOM-context, tekst lezen/herstellen, exacte general/reply/inline-binding |
| Monaco-integratie | Vroege MAIN-world bridge; publieke editorselecties en viewzones |
| Service worker | Afzender-/scopevalidatie, opslag en geautoriseerde bridge-opdrachten |
| Draft-core | CRUD, CAS-revisies, idempotente create, publicatiejournal |
| Opslag | IndexedDB in de extensie-origin; geen website-localStorage |
| Authenticatie | Bestaande Azure DevOps-browsersessie; geen PAT |
| Agents | Dezelfde zichtbare browsercontrols, IDs en revisies |

De Monaco-bridge krijgt alleen noodzakelijke locatiegegevens, geen draftbodies of toegang tot de database. Geen publiek `window.postMessage`-CRUD-contract, verborgen React-state of interne Monaco-services. Publieke API en actuele native DOM blijven wel compatibiliteitsrisico's.

## Context en duurzaam model

Scope bestaat uit organisatie, project-ID, repository-ID, PR-ID en stabiele gebruikers-ID. Alleen PR-nummer of displaynaam is onvoldoende. Onbekende identiteit of ambigue locatie blokkeert binding.

Een draft bewaart UUID, scope, revisie, body en tijdstempels, plus:

- `general`, `inline` of `reply`;
- inline: bestand, side, exacte start-/eindposities, bekeken iteratie, source-/targetcommit en eventueel changeTrackingId;
- reply: bestaande thread-ID;
- toestand `saved`, `sending` of `unknown`, met een duurzaam submissionrecord bij publicatie.

Stale is afgeleid van de actuele heads/iteratie of een verwijderde thread. Geen stille remapping na een push of rename. Expliciet opnieuw koppelen behoudt ID en verhoogt revisie.

Update en delete eisen de gelezen revisie. Multi-tabconflicten overschrijven niets. Idempotente create gebruikt een request-ID; dezelfde request met andere inhoud conflicteert. De service worker herstelt onderbroken `sending`-records als `unknown`.

## Publicatie

1. Lees actuele identiteit, PR, heads, threads en opgeslagen drafts.
2. Blokkeer stale anchors, onbekende publicatiestatus en afwijkende open editorinhoud.
3. Vraag expliciete bevestiging voor het aantal opgeslagen drafts.
4. Bewaar per draft de exacte body en bestaande remote IDs duurzaam als `sending`, vóór het POST-verzoek.
5. Verstuur één same-origin REST-verzoek: nieuwe thread voor general/inline, comment op de bestaande thread voor reply. Geen resolve of vote.
6. Bevestig met GET een unieke nieuwe remote comment met dezelfde auteur, body en locatie. HTTP-succes alleen is onvoldoende om de lokale draft te verwijderen.
7. Bij fout, timeout of ambiguïteit: behoud als `unknown`, stop de batch en herhaal niet automatisch.

Er is geen exactly-once-garantie over netwerkonderbrekingen. **Publicatie controleren** is read-only. Opnieuw vrijgeven voor bewerking vraagt erkenning van het duplicaatrisico.

Gedocumenteerde endpoints:

- [Threads maken](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1)
- [Replies maken](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/create?view=azure-devops-rest-7.1)

## Permissions en privacy

Expliciet toegekende optional host permission voor `dev.azure.com` of een concrete legacy-organisatiehost; dynamische registratie via `scripting`. Geen `<all_urls>`, cookies-, history-, debugger- of nativeMessaging-permissie.

De service worker valideert extensie-afzender, top-level frame, toegestane origin/PR-route, scope en payload. Geen `externally_connectable`, cloudbackend, browsersync of telemetry met bodies. Meegeleverde scripts, geen runtime-CDN.

Lokale opslag is niet versleuteld door Threadhold. Op de pagina weergegeven tekst kan door paginacode worden gelezen. Extensieverwijdering of profielverlies kan drafts vernietigen. “Privé” betekent hier niet als Azure DevOps-comment gepubliceerd, niet onzichtbaar voor alle processen of scripts.

## Agentbediening

| Actie | Zichtbaar contract |
| --- | --- |
| Create/update | `data-threadhold-action="save"` in de bedoelde native editor |
| Read | `data-threadhold-card`, volledige `.th-body` |
| Edit | `data-threadhold-action="edit"` op de kaart |
| Delete | `data-threadhold-action="delete"`, daarna bevestiging |
| Identiteit | `data-threadhold-draft-id` en `data-threadhold-revision` |

Agents wachten op opslagresultaat/revisie, niet op vaste sleeps. Ctrl+Enter is alleen lokaal tijdens geopende draftbewerking; gewone native editors behouden hun eigen publicatiegedrag.

## Verificatie en distributie

Gerichte tests dekken opslagisolatie, revisieconflicten, context/anchorbinding, publicatiepayloads en foutbehoud. Browserfixtures laden de echte unpacked extensie en oefenen CRUD, reload, native draftbewerking en bevestigde batchpublicatie uit zonder bedrijfsdata te publiceren.

De echte Azure DevOps-interface vereist daarnaast visuele en lokale CRUD-verificatie: een fixture bewijst geen blijvende DOM-compatibiliteit. Echte publicatieproeven vereisen afzonderlijke toestemming; zonder die proef wordt geen live publicatieclaim gedaan.

Lever broncode, unpacked build en installatie-/privacyinstructies. Een ZIP is geen ondertekende store-installatie. Publisheraccountstappen en storegoedkeuring zijn nog geen gepubliceerde listing.
