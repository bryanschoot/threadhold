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
| Draft help | Drafthulp |

Onderstaande stappen gebruiken Nederlandse extensielabels. Native **Cancel** kan, afhankelijk van Azure DevOps, Engels blijven.

- Schrijf in de **native editor** en kies **Opslaan als draft**. Pas na duurzame lokale opslag wordt de editor gesloten en verschijnt de draftkaart. De kaart rendert Markdown lokaal en gesanitiseerd; de oorspronkelijke Markdown blijft exact de bron voor bewerken en publiceren. DevOps-mentionreferenties blijven leesbaar zonder externe identiteit-resolutie.
- Het potlood **Bewerken** opent de oorspronkelijke native editor met de opgeslagen tekst, ook als de algemene composer is ingeklapt. Andere aanwezige editorinhoud wordt niet overschreven. **Opslaan** en Ctrl+Enter wijzigen de lokale draft; het ID blijft gelijk en de revisie stijgt.
- **Cancel** verwerpt alleen de niet-opgeslagen bewerking. De laatst opgeslagen draft blijft bestaan.
- Het prullenbakicoon **Draft verwijderen** vraagt bevestiging en verwijdert alleen de lokale draft.
- Er is geen draft-tab of navigatie-index. Drafts staan bij gewone comments. Een niet-gemounte of verouderde locatie krijgt een herstelkaart tussen de Overview-comments.
- Na gewijzigde code: kies **Opnieuw koppelen**, open de bedoelde nieuwe native editor en bevestig **Draft hier koppelen**. Geen automatische regelremapping.
- **Drafts plaatsen (n)** naast **Approve**, of naast de native **Publish**-actie bij een draft-PR, vraagt bevestiging en publiceert daarna de opgeslagen drafts één voor één. Dit keurt de PR niet goed, publiceert niet de draft-PR zelf en resolveert geen threads.
- Bij een onbewezen publicatieresultaat blijft de draft behouden als onbekend en stopt de batch. **Publicatie controleren** doet uitsluitend GET-verzoeken. **Opnieuw bewerken** vraagt expliciete erkenning van mogelijk dubbele publicatie. Geen automatische retry.

## Native weergaven en compatibiliteit

Algemene comments, replies en inline drafts gebruiken de bestaande Azure DevOps-editor. Enkele en meerregelige anchors bewaren begin- en eindregel én kolommen, in inline en aan beide kanten van side-by-side. In **All Changes** legt de extensie de native kant/regelselectie vast vóór focus en DOM-vervanging; tijdelijke negatieve thread-ID's zijn niet tot `-1` beperkt. De Monaco-enkelbestandseditor gebruikt de publieke editor-API voor selectie, viewzone-ruimte en begrensde interactieve overlays boven de codelaag, niet verborgen React-state. Een anoniem origineel model wordt alleen gekoppeld via de unieke modified-partner binnen dezelfde diff, met gecontroleerde repository en sourcecommit.

Azure DevOps biedt geen stabiel contract voor deze DOM-uitbreiding. Onbekende of ambigue locaties krijgen geen gegokte draftbinding. Een UI-update kan aanpassing van de adapter vereisen. Gewone native publicatie zonder draftbinding blijft ongewijzigd.

## Browseragents

Een agent begint bij **Draft help / Drafthulp** naast de PR-acties. Die ingebouwde, toegankelijke dialoog is de bron voor de CRUD-procedure, controleerbare opslagresultaten en de veilige standaardinstructie: alleen lokale drafts, publiceren uitsluitend op expliciet verzoek. Geen repositorykennis, CLI, MCP-server of lokale poort nodig.

| Actie | Control |
| --- | --- |
| Create/update | `data-threadhold-action="save"` |
| Read | `data-threadhold-card`, volledige `.th-body` |
| Edit | `data-threadhold-action="edit"` |
| Delete | `data-threadhold-action="delete"`, daarna zichtbare bevestiging |
| Locatie | `data-threadhold-action="locate"` |
| Publicatie controleren | `data-threadhold-action="check"` |

Kaarten en gekoppelde controls hebben `data-threadhold-draft-id` en `data-threadhold-revision`. Zoek controls binnen de bedoelde kaart/editor. Agent-CRUD gebruikt de draftacties; alleen bij een geopende **draftbewerking** is Ctrl+Enter lokaal. Gebruik die sneltoets niet in een gewone nieuwe commenteditor: daar blijft Azure DevOps zelf publiceren. Dit is geen sandbox tegen willekeurige native acties.

Wacht op de resulterende kaart, hogere revisie of verwijdering, niet op een vaste sleep of alleen een geslaagde klik. Kaarten geven `data-threadhold-state` aan; live-statusmeldingen hebben `data-threadhold-status` en `role=status/alert`, bezette bediening `aria-busy`. Bij ontbrekende draftcontrols of onbekende publicatiestatus stopt de agent en meldt dit, zonder native publicatie als fallback.

## Privacy en herstel

- Drafts staan in IndexedDB van de **extensie-origin**, gescheiden per organisatie, project, repository, PR en stabiele gebruikers-ID.
- Geen PAT, externe backend, telemetry of browsersync. Context wordt via GET gelezen met de bestaande browsersessie. Alleen de expliciet bevestigde publicatieactie verstuurt comment-POST-verzoeken naar dezelfde Azure DevOps-origin.
- De database is niet door Threadhold versleuteld. Scripts op de Azure DevOps-pagina kunnen de daar weergegeven drafttekst lezen. “Alleen lokaal” betekent niet “onzichtbaar voor paginacode”.
- Multi-tabupdates gebruiken revisiecontrole. Bij een conflict wordt geen andere revisie overschreven; de native editor behoudt de tekst.
- Onderbroken publicatie krijgt status onbekend bij serviceworkerherstart. Geen automatische retry en geen exactly-once-garantie.
- Verwijderen van de extensie of verlies van het browserprofiel kan drafts onherstelbaar wissen. Er is geen cloudbackup.

## Verificatiegrens

- De herstelronde voor het smalle native commentpaneel is geverifieerd met typecheck, productiebuild en 28 geslaagde gerichte browsercases. De volledige unit- en browsersuites zijn daarvoor niet opnieuw uitgevoerd.
- All Changes heeft acht selectiecases: inline/split, links/rechts, enkel-/meerregelig, inclusief refresh, native bewerken en exacte publicatiecoördinaten tegen de testbackend. Extra cases controleren toetsenbordactivatie en het veilig weigeren van een selectie over beide kanten zonder tekstverlies.
- Zes extra cases draaien een echte Monaco 0.57-editor in de geobserveerde textarea-invoermodus. Ze controleren refresh, muisklikbare Edit/Delete, lokale wijziging/annulering, paneelgrenzen, horizontale en verticale scrollbarbediening, wielscrollen en versmallen in inline rechts en split links/rechts.
- Tien echte-Monaco-cases controleren Comment selected text via muis, Enter en F4 in inline rechts en split links/rechts, plus F4 zonder selectie voor een volledige regel. Native Insert a suggestion wordt lokaal opgeslagen, herladen en bewerkt; exacte Markdown en selectiecoördinaten worden bij publicatie tegen de geïsoleerde testbackend gecontroleerd. All Changes-fixtures bevatten ook het verborgen Plus-toegankelijkheidslabel om verschoven bronkolommen af te vangen.
- Twaalf extra cases gebruiken de live aangetroffen smalle paneelstructuur buiten Monaco: inline rechts en split links/rechts, enkelregelige comments en meerregelige suggestions via F4, muis en Enter. Ze controleren opslaan, herladen, native heropenen, Ctrl+Enter en exacte payloads tegen de testbackend. De desktop- en paneelfixtures bevatten een Bolt-meet-textarea zonder aria-hidden; die mag geen extra draftknop of verkeerde invoerbinding opleveren.
- De draft-PR-header en ingeklapte algemene composer hebben regressies. Engelse/Nederlandse previewtests controleren Markdown, onveilige HTML/URL's, behouden broninhoud, mentionreferenties, avataridentiteit, relatieve tijd en kaartplaatsing.
- De browsercases laden de echte unpacked extensie in geïsoleerde profielen met een testbackend. De echte Monaco-surface is visueel bekeken; de testhost bevat geen volledige DevOps-styling. Dit is geen pixelvergelijking met de actuele Azure DevOps-UI en geen stabiel DOM-contract.
- Eerder ontdekte een verse browseragent zonder repositorykennis Draft help en voerde lokale CRUD uit met behoud van ID/revisies en nul schrijfverzoeken. De huidige suite behoudt de help-/CRUD-regressies.
- Door de gebruiker aangeleverde live DOM-uitlezingen toonden twee native varianten: op smalle schermen een bolt-panel buiten Monaco, op desktop een zone-widget binnen Monaco. De nieuwe paneelregressie faalde vóór de fix op de ontbrekende Save as draft-knop en slaagde erna. Na het herladen van Threadhold meldde de gebruiker live: “Lijkt te werken nu”. Dit is een positieve gebruikerswaarneming, geen onafhankelijke volledige live hercontrole: navigatie vanuit deze agentsessie bleef mislukken met relay extension disconnected. Er zijn geen browser-/tab-sluitcommando's via de relay uitgevoerd; geautomatiseerde checks gebruiken uitsluitend wegwerp-testprofielen.
- Er zijn geen echte Azure DevOps-comments gepubliceerd, threads gewijzigd of bijlagen geüpload voor deze herstelronde. Live serverpublicatie, volledige DevOps-mentionnaamresolutie en store-installatie worden niet als geverifieerd geclaimd.
