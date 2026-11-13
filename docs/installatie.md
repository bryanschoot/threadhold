# Threadhold installeren

## Broncode en unpacked extensie

Vereist: Node.js 22 of nieuwer, npm en Chrome/Edge 124 of nieuwer. De repository is privé; je GitHub-account moet toegang hebben.

```sh
git clone https://github.com/bryanschoot/threadhold.git
cd threadhold
npm ci
npm run typecheck
npm test
npm run build
```

1. Open `chrome://extensions` of `edge://extensions`.
2. Zet **Developer mode / Ontwikkelaarsmodus** aan.
3. Kies **Load unpacked / Uitgepakte extensie laden** en selecteer `.output/chrome-mv3` in de repository.
4. Open Threadhold via de extensieknop. Vul `dev.azure.com` of de concrete `organisatie.visualstudio.com`-host in en kies **Toegang geven**. Bevestig de browserpermissie.
5. Open of ververs de Azure DevOps-PR. Open een native commenteditor; **Opslaan als draft** verschijnt naast de bestaande acties.

Een al geopende tab moet na een extensie-update worden ververst. Toegang intrekken stopt nieuwe opslagverzoeken; ververs geopende tabs om hun bestaande controls te verwijderen. Opgeslagen drafts blijven lokaal bewaard zolang het profiel en de extensie behouden blijven.

`npm run zip` maakt een distributiearchief in `.output`. Dat is geen ondertekende store-installatie; pak het uit voor **Load unpacked**. Er is geen Chrome/Edge-storelisting gepubliceerd.

## Bediening

De extensie volgt `navigator.language` van de browser. Engels is de standaard en de fallback; `nl`, `nl-NL` en `nl-BE` krijgen Nederlands. Knoppen, popup, toegankelijke labels, meldingen en bevestigingen worden vertaald. Draftinhoud en native DevOps-controls blijven ongewijzigd.

| Engels | Nederlands |
| --- | --- |
| Save as draft | Opslaan als draft |
| Edit / Save / Cancel | Bewerken / Opslaan / Annuleren |
| Delete draft | Draft verwijderen |
| Publish drafts (n) | Drafts plaatsen (n) |

Onderstaande stappen gebruiken Nederlandse extensielabels. Native **Cancel** kan, afhankelijk van Azure DevOps, Engels blijven.

- Schrijf in de **native editor** en kies **Opslaan als draft**. Pas na duurzame lokale opslag wordt de editor gesloten en verschijnt de draftkaart.
- Het potlood **Bewerken** opent de oorspronkelijke native editor met de opgeslagen tekst. Andere aanwezige editorinhoud wordt niet overschreven. **Opslaan** en Ctrl+Enter wijzigen de lokale draft; het ID blijft gelijk en de revisie stijgt.
- **Cancel** verwerpt alleen de niet-opgeslagen bewerking. De laatst opgeslagen draft blijft bestaan.
- Het prullenbakicoon **Draft verwijderen** vraagt bevestiging en verwijdert alleen de lokale draft.
- Er is geen draft-tab of navigatie-index. Drafts staan bij gewone comments. Een niet-gemounte of verouderde locatie krijgt een herstelkaart tussen de Overview-comments.
- Na gewijzigde code: kies **Opnieuw koppelen**, open de bedoelde nieuwe native editor en bevestig **Draft hier koppelen**. Geen automatische regelremapping.
- **Drafts plaatsen (n)** naast **Approve** vraagt bevestiging en publiceert daarna de opgeslagen drafts één voor één. Dit keurt de PR niet goed en resolveert geen threads.
- Bij een onbewezen publicatieresultaat blijft de draft behouden als onbekend en stopt de batch. **Publicatie controleren** doet uitsluitend GET-verzoeken. **Opnieuw bewerken** vraagt expliciete erkenning van mogelijk dubbele publicatie. Geen automatische retry.

## Native weergaven en compatibiliteit

Algemene comments, replies en inline drafts gebruiken de bestaande Azure DevOps-editor. Meerregelige anchors bewaren begin- en eindregel én kolommen. De Monaco-enkelbestandseditor gebruikt de publieke editor-API voor selectie en lokale viewzones, niet verborgen React-state.

Azure DevOps biedt geen stabiel contract voor deze DOM-uitbreiding. Onbekende of ambigue locaties krijgen geen gegokte draftbinding. Een UI-update kan aanpassing van de adapter vereisen. Gewone native publicatie zonder draftbinding blijft ongewijzigd.

## Browseragents

Een agent gebruikt dezelfde zichtbare knoppen. Geen CLI, MCP-server of lokale poort nodig. Wacht op het live-statusbericht na een actie, niet op een vaste sleep.

| Actie | Control |
| --- | --- |
| Create/update | `data-threadhold-action="save"` |
| Read | `data-threadhold-card`, volledige `.th-body` |
| Edit | `data-threadhold-action="edit"` |
| Delete | `data-threadhold-action="delete"`, daarna zichtbare bevestiging |
| Locatie | `data-threadhold-action="locate"` |
| Publicatie controleren | `data-threadhold-action="check"` |

Kaarten en gekoppelde controls hebben `data-threadhold-draft-id` en `data-threadhold-revision`. Zoek controls binnen de bedoelde kaart/editor. Agent-CRUD gebruikt de draftacties; alleen bij een geopende **draftbewerking** is Ctrl+Enter lokaal. Gebruik die sneltoets niet in een gewone nieuwe commenteditor: daar blijft Azure DevOps zelf publiceren. Dit is geen sandbox tegen willekeurige native acties.

## Privacy en herstel

- Drafts staan in IndexedDB van de **extensie-origin**, gescheiden per organisatie, project, repository, PR en stabiele gebruikers-ID.
- Geen PAT, externe backend, telemetry of browsersync. Context wordt via GET gelezen met de bestaande browsersessie. Alleen de expliciet bevestigde publicatieactie verstuurt comment-POST-verzoeken naar dezelfde Azure DevOps-origin.
- De database is niet door Threadhold versleuteld. Scripts op de Azure DevOps-pagina kunnen de daar weergegeven drafttekst lezen. “Alleen lokaal” betekent niet “onzichtbaar voor paginacode”.
- Multi-tabupdates gebruiken revisiecontrole. Bij een conflict wordt geen andere revisie overschreven; de native editor behoudt de tekst.
- Onderbroken publicatie krijgt status onbekend bij serviceworkerherstart. Geen automatische retry en geen exactly-once-garantie.
- Verwijderen van de extensie of verlies van het browserprofiel kan drafts onherstelbaar wissen. Er is geen cloudbackup.

## Verificatiegrens

- Typecheck, productiebuild, 38 unittests en 7 browsercases zijn uitgevoerd en geslaagd.
- De browsercases laden de echte unpacked extensie in een geïsoleerd profiel en dekken beide talen, lokale CRUD, refresh, multiline Monaco-anchors, verborgen meetvelden, native actieremounts en bevestigde publicatie tegen een fixture.
- In echte Azure DevOps zijn native lettertype/padding en lokale replybewerking gecontroleerd.
- De laatste live meerregelige eindcontrole kon niet worden afgerond door het verbreken van de browserrelay. De gebruiker heeft gekozen die controle handmatig te doen.
- Er zijn geen echte Azure DevOps-comments gepubliceerd voor deze verificatie. Live serverpublicatie en store-installatie worden niet als geverifieerd geclaimd.
