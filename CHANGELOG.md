# Changelog

## 0.1.0

- Browser-only Chrome/Edge-extensie voor lokale Azure DevOps-PR-drafts.
- Engelse interface als standaard/fallback, Nederlands op basis van de browsertaal.
- Duurzame general/inline/reply-CRUD met account-/PR-scope, revisies en multi-tabconflictdetectie.
- Draftkaarten tussen native comments; geen extra tab. Native avatar, typografie en bewerk-/verwijdericonen.
- Potlood opent ook de ingeklapte algemene native editor; Opslaan en Ctrl+Enter wijzigen de draft lokaal. Cancel behoudt de opgeslagen versie.
- Exacte meerregelige Monaco-anchors met begin-/eindkolommen; gereserveerde viewzones met begrensde interactieve overlays boven de codelaag.
- Native All Changes-selecties bewaren kant, regels en UTF-16-kolommen vóór het openen van de editor. Alle negatieve tijdelijke thread-ID's worden ondersteund; ambigue selecties worden niet gegokt.
- Anonieme originele Monaco-modellen worden uitsluitend via hun eigen commit-gecontroleerde diffpartner gekoppeld. Native heropenen gebruikt de zichtbare selectieknop en behoudt ook ingeklapte anchors.
- Native Comment selected text ondersteunt muis, toetsenbordactivatie en F4, inclusief een volledige regel zonder selectie. Suggestions behouden hun oorspronkelijke Markdown bij lokaal opslaan, herladen, bewerken en publiceren.
- All Changes-kolommen tellen uitsluitend broncode; verborgen toegankelijkheidslabels zoals Plus verschuiven de selectie niet.
- Smalle DevOps-schermen gebruiken een apart native commentpaneel buiten Monaco. Drafts koppelen dat paneel aan de exacte native selectiemarkering, ook bij meerregelige suggestions en native heropenen; ambigue editorlocaties worden geweigerd.
- De verborgen Bolt-meet-textarea wordt expliciet uitgesloten, ook wanneer DevOps geen aria-hidden instelt.
- Drafts plaatsen naast Approve, of naast Publish bij draft-PR's, met bevestiging, duurzaam publicatiejournal en verificatie van remote IDs. Geen automatische retry, approve of resolve.
- Ingebouwde Engelse/Nederlandse Draft help met lokale browseragent-CRUD, controleerbare opslagresultaten en expliciete publicatiegrens; toegankelijk via toetsenbord en schermlezer.
- Lokale Markdownweergave met sanitization, veilige links en leesbare DevOps-mentionreferenties; broninhoud blijft exact behouden voor bewerken en publiceren.
- Algemene drafts staan als native kaart bij de composer; avatarselectie vereist overeenkomende identiteit en tijden worden relatief weergegeven.
- Unpacked distributie; geen gepubliceerde Chrome/Edge-storelisting.
