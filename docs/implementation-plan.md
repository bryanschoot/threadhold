# Threadhold — browserextensie en implementatieplan

**Bindende productrichting:** uitsluitend een browserextensie die de bestaande Azure DevOps-commenteditor met drafts uitbreidt. Geen aparte review-app, CLI, MCP-server, lokale HTTP-server of desktopproces. Dit document is een ontwerp; de extensie is nog niet gebouwd.

## 1. Productgedrag

De gebruiker blijft op de Azure DevOps-PR-pagina, in dezelfde inline-, algemene of reply-editor. Threadhold voegt naast de bestaande acties **Opslaan als draft** toe, plus een herkenbare lokale draftstatus.

- Create: typ in de native editor en kies **Opslaan als draft**.
- Read: lees de volledige draftkaart op dezelfde plek als gewone comments; **Drafts (n)** is alleen een extra navigatie-index.
- Update: kies **Bewerken**, herstel tekst in dezelfde native editor en kies **Draft bijwerken**. Het draft-ID blijft gelijk.
- Delete: kies **Draft verwijderen**. Dit verwijdert uitsluitend de lokale concepttekst.
- Publiceren: de bestaande native **Comment**- of **Reply**-actie blijft de expliciete publicatiestap. Opslaan, bewerken, verwijderen, navigeren en drafts herstellen publiceren nooit.

Ondersteun inline comments, algemene PR-comments en replies. Een draft is een nieuwe lokale resource, geen gewijzigde `pending`-status op een echte Azure DevOps-comment. Gepubliceerde comments wijzigen/verwijderen valt niet onder draft-CRUD.

## 2. UI-integratie: aanvullen, niet vervangen

Zie [UI-schets](../.lavish/product-plan.html). De native editor, Markdown-toolbar, mentions, preview en diff blijven van Azure DevOps. Threadhold bouwt deze niet opnieuw.

Toevoegingen:

1. **Drafts (n)** in de PR-header opent een compacte navigatie-index naar de draftkaarten; geen zijlade als primaire draftweergave en geen los dashboard.
2. **Opslaan als draft** in de bestaande comment-actierij, visueel onderscheiden van **Comment**.
3. Na bevestigde lokale opslag verschijnt de draft **als volledige native-ogende commentkaart**, met auteur, body, **Draft · alleen voor jou** en **Bewerken / Draft verwijderen**. Inline op de diff, algemene feedback tussen de Overview-comments, conceptreply in de bestaande thread. Niet alleen een badge of tekst in een index. Mount de kaart opnieuw na navigatie of refresh zonder duplicaten; toon pas een opgeslagen kaart na bevestigde opslag.
4. Bij een gekoppeld concept toont dezelfde editor **Draft bijwerken**, draft-ID en revisie.
5. De compacte index toont locatie/type en status binnen de huidige PR/accountcontext. Een item navigeert naar de volledige draftkaart; **Bewerken** op die kaart opent de oorspronkelijke native editor.
6. Bij gewijzigde code: **Locatie verouderd — opnieuw koppelen**. De tekst blijft leesbaar en verwijderbaar; geen stil herstel op een ander regelnummer.

**Annuleren** behoudt de laatst opgeslagen draft; niet-opgeslagen editorwijzigingen vragen bevestiging vóór Threadhold ze wist of vervangt. Een geopende editor met eigen tekst wordt nooit automatisch overschreven door een draft.

De native **Comment**-actie blijft publiceren, ook de bijbehorende native sneltoets. Threadhold maakt daarvan niet stilzwijgend een draft-save. Een agent gebruikt expliciet de draftactie; publicatie is geen onderdeel van agent-CRUD. Voor gekoppelde drafts komt een gerichte publicatieguard voor stale/conflict/onbekend resultaat; gewone niet-gekoppelde comments blijven ongemoeid.

## 3. Technische keuzes

| Onderdeel | Keuze | Reden |
| --- | --- | --- |
| Browserplatform | Manifest V3, Chrome en Edge | Dezelfde Chromium-extensie; geen Firefox-pariteitsclaim |
| Code | TypeScript, WXT, kleine DOM-controls | Eén extensiebundle, geen zware vervangende review-UI |
| Content script | Geïsoleerde wereld, alleen toegestane ADO-hosts | Native commenteditors aanvullen en gebruikersacties afhandelen |
| Achtergrond | Extension service worker | Valideert berichten, bezit opslag en draftregels |
| Draftopslag | IndexedDB in de extensie-origin | Duurzame records, indices en transacties voor revisies/meerdere tabs |
| Instellingen | chrome.storage.local | Kleine lokale voorkeuren; geen draftbodies in sync |
| Authenticatie | Bestaande ingelogde Azure DevOps-pagina | Native publicatie door Azure DevOps; geen PAT of eigen tokenopslag |
| Agentbediening | Bestaande browsertools op zichtbare controls | Geen extra agenttransport of lokaal proces |

WXT en concrete packageversies moeten bij uitvoering worden vastgezet. Geen dependencies geïnstalleerd of browserstore-publicatie aangevraagd.

### Module-interface en seams

De **draft-core-module** bezit create/get/list/update/delete en de toestanden rond native publicatie. Hij verbergt scopecontrole, revisies en transacties.

De **ADO-editoradapter** is de seam tussen de native DOM en draft-core: editor ontdekken, tekst lezen/herstellen, PR/account/anchorcontext vastleggen en native publicatie volgen. Alle kwetsbare DOM-kennis blijft hier; geen selectors verspreid over opslag of controls.

De **opslagadapter** gebruikt IndexedDB vanuit de service worker. Het content script stuurt gevalideerde extensieberichten; het opent niet zelf `window.indexedDB`, want dat zou websiteopslag zijn. Geen tweede bron van waarheid in editor-localStorage.

De inline draftkaarten, navigatie-index en knoppen zijn adapters op dezelfde draft-core-interface. Agents bedienen diezelfde interface via DOM-controls, niet via directe databasewrites.

## 4. Permissions en berichten

Begin met toegang tot `https://dev.azure.com/*` en, optioneel na gebruikerskeuze, de concrete legacy-organisatie op `https://<organisatie>.visualstudio.com/*`. Alleen PR-routes activeren de integratie. Geen `<all_urls>`, cookies-, history-, debugger-, nativeMessaging- of webRequest-permissies.

Gebruik dynamische registratie met `scripting` en expliciet toegekende optional host permissions zodat de gebruiker de gewenste ADO-host kiest. Instellingen vragen `storage`. Vraag niet standaard `unlimitedStorage`; behandel quota-/persist-fouten zichtbaar en claim nooit een niet-opgeslagen draft.

De service worker controleert bij ieder bericht: eigen extensie-afzender, top-level tab/frame, toegestane origin/PR-route, overeenkomende scope, bekend berichttype en gevalideerde payload. Geen `externally_connectable`, generieke `window.postMessage`-CRUD of publiek pagina-JavaScriptcontract. De website mag niet de volledige draftdatabase opvragen.

Scripts en styles worden meegeleverd; geen CDN-runtime of remote uitvoerbare code in de uiteindelijke extensie. De statische ontwerppagina is geen extensiebundle.

## 5. Context en duurzaam model

`DraftScope`: organisatie-origin/organisatie, project-ID, repository-ID, PR-ID en stabiele ingelogde Azure DevOps-gebruikers-ID, binnen het browserprofiel. Gebruik nooit alleen PR-nummer of account-displaynaam. De eerste integratieproef moet aantonen hoe deze context betrouwbaar uit de pagina en gedocumenteerde read-only REST-data wordt verkregen. Bij onduidelijke identiteit/scope wordt geen draft aan een editor gekoppeld.

`DraftComment`:

- UUID, scope, revisie, Markdown-body, created/updated-tijd;
- type `general`, `inline` of `reply`;
- inline: bestandspad, side left/right, start-/eindposities, bekeken iteraties, source-/targetcommit, changeTrackingId en korte contextsnippet;
- reply: bestaande thread-ID en parentcontext, geen nieuw inline anchor;
- status `saved`, `stale`, `sending` of `unknown`;
- optioneel laatst bevestigd remote thread-/comment-ID.

Gebruik indices op scope en update-tijd. Transacties bewaren body, revisie en eventuele request-ID samen. Update/delete vereisen de gelezen revisie; een conflict overschrijft geen werk uit een andere tab. Update behoudt het ID. Een dubbele saveactie met dezelfde request-ID en inhoud is een no-op; andere inhoud met dezelfde request-ID conflicteert.

Laat de editor zijn tekst behouden totdat de save is bevestigd. Een opslagfout, quotaoverschrijding, serviceworker-stop of gesloten berichtkanaal mag niet leiden tot “opgeslagen” zonder duurzaam record. Na herstart wordt alle state uit IndexedDB hersteld; globals zijn alleen caches.

Bij accountwisseling worden drafts van het andere account niet getoond of hersteld. Dat is functionele scheiding, geen beveiliging tegen de eigenaar van hetzelfde browserprofiel.

## 6. Native editorintegratie en onderhoudsrisico

Azure DevOps levert geen in dit onderzoek aangetroffen stabiel contract voor het uitbreiden van zijn editor-DOM. Dit is het grootste onderhoudsrisico.

- Onderzoek eerst de actuele textarea/contenteditable-editor en native controls op een toegestane PR. Geen aangenomen selectors of aanroepen op verborgen React-state.
- Zoek editors binnen een herkende context, met semantische rollen/labels en geverifieerde structurele kenmerken. Lokaliseer extensionlabels; hardcode geen Engelse native knoptekst als enige selector.
- Herstel tekst met het bewezen invoer-/eventcontract van de native editor; alleen `.value` zetten is niet voldoende voor een controlled editor.
- Gebruik een gerichte MutationObserver voor SPA-navigatie en opnieuw gemounte editors. Mount elke control eenmaal per editor; verwijder listeners/observers bij navigatie. Observeer niet voortdurend elke toetsaanslag in de hele pagina.
- Houd editorbindingen apart voor inline/general/reply en diffside. Leeft een gekoppelde editor niet meer, bewaar de draft en zoek opnieuw; herstel niet naar een willekeurige open editor.
- Beperk eigen styling tot extensiecontrols. Volg Azure DevOps-typografie, spacing, thema en focusstijlen; overschrijf geen globale knoppen of Markdown-CSS.
- Bij onbekende DOM-versie: geen draft-save of automatisch invullen; toon een duidelijke compatibiliteitsmelding en behoud opgeslagen drafts. Laat gewone Azure DevOps-commentfunctionaliteit werken.

## 7. Publiceren en opruimen van een draft

Er komt **geen eigen REST-publicatiepad** naast de native knop. Zo behoudt Azure DevOps zijn bestaande sessie, editorvalidatie en publicatiegedrag.

Voor een gekoppelde draft:

1. Controleer actuele gebruiker, PR, locatie en revisie. Gewijzigde heads/iteraties maken inline anchors stale; herstel of publiceer niet automatisch op hetzelfde regelnummer. Replies naar een verwijderde thread blijven drafts.
2. Laat de reviewer de exacte tekst in de native editor zien. Publiceren is alleen de native **Comment/Reply**-actie, niet het openen van de draft.
3. Een gerichte submitguard legt de gekoppelde draft en inhoud duurzaam als `sending` vast vóór de native submit wordt doorgelaten. Dezelfde guard dekt de native sneltoets. De editoradapter moet deze delegatie éénmaal kunnen doen zonder dubbele submit of globale wijziging van alle editors; bewijs dit in de integratieproef. Als dat niet betrouwbaar lukt, wordt publicatie van gekoppelde drafts geblokkeerd, niet via een tweede verborgen pad uitgevoerd.
4. Verwijder de draft alleen na een verifieerbaar native succes met een gekoppeld remote comment-ID en de bedoelde inhoud/context. Een gesloten of leeg editorvak is geen bewijs. Gebruik zo nodig gedocumenteerde read-only comment-REST-data voor bevestiging.
5. Bij definitieve afwijzing: terug naar `saved`, tekst behouden. Bij timeout, navigatie of crash zonder bewezen uitkomst: `unknown`, concept behouden en niet automatisch opnieuw posten.
6. Toon bij `unknown` de actie **Publicatie controleren**. Een reviewer kan een bevestigd remote resultaat koppelen. Bij ambiguïteit blijft de draft behouden; opnieuw publiceren vereist expliciet besef van mogelijk duplicaat.

Geen automatische batchpublicatie, native vote of thread-resolutie. Geen exactly-once-garantie: een remote verwerking kan bij een onderbreking al hebben plaatsgevonden. Gewone native comments die niet aan een draft gekoppeld zijn vallen buiten dit journal.

## 8. Volledige agent-CRUD via de browser

De agent moet een browser met de geïnstalleerde extensie en de bedoelde ingelogde sessie kunnen bedienen. Een headless browser zonder extensie of een shellagent zonder browsertoegang heeft deze mogelijkheden niet. Dat is een expliciete consequentie van browser-only.

Gebruik echte buttons, labels, statusgebieden en stabiele `data-threadhold-action`, `data-threadhold-draft-id` en revisie-attributen. De agent hoeft geen willekeurige CSS-klassen of verborgen JS-functies te raden.

| Actie | Browserstappen | Waarneembaar resultaat |
| --- | --- | --- |
| Create | Native editor openen, tekst invullen, **Opslaan als draft** | Draft-ID, revisie en bevestigde lokale status; geen remote write |
| Read/list | Volledige draftkaart lezen; zo nodig via **Drafts** naar een kaart navigeren | Volledige body, type, locatie, status en revisie |
| Update | Item **Bewerken**, native tekst wijzigen, **Draft bijwerken** | Zelfde ID, volgende revisie of expliciet conflict |
| Delete | Item **Draft verwijderen**, lokale bevestiging | Item verwijderd; teller en lege toestand bijgewerkt |

De navigatie-index toont exact totaal, expliciete lege toestand en een manier om alle draftkaarten te bereiken, ook bij gevirtualiseerde diffs. Save/delete-resultaten staan in een toegankelijk live-statusgebied; agentacties kunnen daarop wachten, zonder arbitraire sleeps. Offscreen of verborgen drafts worden niet als onzichtbare DOM-dump van de database aangeboden.

De agent gebruikt voor draft-CRUD geen **Comment/Reply** of Ctrl+Enter. Dit is een bedieningscontract, geen sandbox tegen een agent die willekeurig de native publishknop kan aanklikken.

## 9. Privacy en foutgedrag

- Geen cloudbackend, browsersync, telemetry met bodies, PAT, cookie-extractie of tokenopslag.
- Extension-origin opslag is niet hetzelfde als versleuteling. De profileigenaar en processen met passende OS-rechten kunnen data mogelijk lezen.
- Zodra drafttekst in een inline kaart, native editor of navigatie-index staat, kan de hostpagina die DOM-inhoud lezen. Claim alleen “niet als comment gepubliceerd”; niet “onzichtbaar voor Azure DevOps-paginacode”.
- Extensioncontrols renderen body als tekst of veilig gesanitiseerde preview; geen raw HTML, automatisch geladen externe afbeeldingen of uitvoerbare links.
- Verwijderen wist het lokale record, niet eerder gepubliceerde feedback, backups of alle forensische resten. Browserprofielverlies of verwijderen van de extensie kan drafts vernietigen.
- Voor nieuwe pushes/renames geen slimme stille remapping. Laat de gebruiker de juiste native locatie kiezen en expliciet herankeren; behoud daarbij ID en wijzig revisie.
- Een opslag- of compatibiliteitsfout bewaart editorinhoud en geeft een concrete foutmelding. Geen stille fallback naar gewone publicatie.

## 10. Uitvoering in verticale stappen

### Stap 0 — live integratiecontract vaststellen

Onderzoek in een toegestane browser/PR de echte editors, thema's, navigatie, accountcontext, anchors en submit-successdetectie. Beoordeel bestaande browserextensies op bruikbare patronen en licentie; geen overname van een hele aparte reviewinterface.

Bewijs de gecontroleerde native submitdelegatie en koppeling aan een remote ID in een disposable PR. Vraag afzonderlijk toestemming voor echte publicatieproeven. Als deze integratievoorwaarden niet werken, herzie het ontwerp met de gebruiker; beloof geen onbewezen generieke DOM-integratie.

### Stap 1 — bestaande editor + duurzame draft-CRUD

Maak de MV3-extensie met scoped content script, service worker, IndexedDB-migratie en draft-core. Voeg save, volledige lokale commentkaarten, navigatie-index, edit en delete toe aan inline/general/reply. Bewijs behoud na refresh/browserherstart en correcte account-/PR-scheiding. Geen losse app of lokale server.

### Stap 2 — robuuste browser- en agentbediening

Realiseer SPA-remounts, meerdere tabs, revisieconflicten, stabiele toegankelijke controls, alle vier agentacties, stale-anchorherstel en light/dark/high-contrastweergave. Mens en agent bedienen dezelfde knoppen; geen tweede storagecontract.

### Stap 3 — native publicatieafronding

Voeg de gekoppelde submitguard, durable `sending`, succesverificatie en unknown-herstel toe. Verwijder drafts alleen bij bewezen publicatie. Controleer native sneltoetsen, gewone niet-gekoppelde comments en replies zonder onbedoelde resolve.

### Stap 4 — extensiedistributie

Lever een unpacked build plus installeerbaar Chrome/Edge-pakket, installatie-/permissions-/privacydocumentatie en ondersteunde browser-/ADO-varianten. Store-publicatie vereist de publisheraccountstappen van de gebruiker; geen gepubliceerde listing claimen voordat die werkelijk bestaat. De bestaande GitHub-repo bevat broncode en plan, geen bedrijfsdrafts.

## 11. Gerichte acceptatie

Dit zijn geplande checks, nog niet uitgevoerd. Vraag altijd vooraf toestemming voor build, test, lint en smokechecks. Het huidige werk verifieert alleen de statische schets.

- Save in de native editor maakt één lokale draft en toont die als volledige commentkaart op de native locatie, ook na refresh; er is nul Azure DevOps-writeverkeer en voor een tweede reviewer verschijnt geen comment.
- Read/update/delete werken zowel met menselijke klikken als via een browseragent. Update behoudt ID, conflict behoudt tekst, delete raakt geen remote comments.
- Drafts blijven bestaan na refresh, browserherstart en serviceworker-restart; meerdere tabs verliezen geen updates.
- Inline/general/reply, left/right, meerregelige selecties, Unicode, mentions en Markdown blijven exact behouden.
- Nieuwe push, rename, verwijderde thread en accountwisseling koppelen geen draft aan de verkeerde context.
- Save-fout/quota geeft geen valse succesmelding; native tekst blijft beschikbaar.
- Native submit en de native sneltoets publiceren een gekoppelde draft eenmaal per intentie; pas bewezen remote succes verwijdert hem.
- Timeout/crash rond native submit bewaart `unknown` en veroorzaakt geen automatische retry.
- Native editors zonder draftbinding blijven ongewijzigd werken; DOM-remount geeft geen dubbele knoppen.
- Werkelijke extensie-UI controleren in de echte Azure DevOps-pagina, op smal scherm en light/dark/high contrast. Een statische mockup bewijst die integratie niet.
