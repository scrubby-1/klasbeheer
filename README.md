# Klasbeheer

Een webapp om je klassen, leerlingen en evaluaties centraal op één plaats te beheren.
Je kan je bestaande Excel-puntenboek importeren: elk tabblad wordt een klas met een vak, en de punten en maxima worden overgenomen.

## Wat kan de app?

- **Overzicht**: alle klassen en vakken met het klasgemiddelde en de spreiding (elke stip is een leerling, rood is onder 50%). Daarnaast de evaluaties die nog niet volledig ingevuld zijn en de leerlingen die onder 50% staan.
- **Evaluaties**: één lijst met alle evaluaties van alle klassen. Je kan filteren op klas, vak en soort, en sorteren op datum, gemiddelde of hoe volledig ze ingevuld zijn.
- **Puntenboek per klas en vak**: punten rechtstreeks in de tabel typen.
  - Gebruik Enter of de pijltjestoetsen om van vak naar vak te gaan.
  - Je kan een blok cijfers uit Excel plakken.
  - De laatste kolom toont het percentage van de leerling.
- **De regel voor het percentage** is dezelfde als in het Excel-puntenboek: enkel de evaluaties die je invult, tellen mee.
  - Laat een vak leeg of typ een code (bv. `A` = afwezig, `Z` = ziek) als een leerling niet deelnam.
  - Een `0` telt wel mee.
- **Leerlingfiche**: alle punten van één leerling per vak, plus een notitieveld.
- **Klassen en leerlingen**: leerlingen toevoegen (een lijst plakken kan) en bewerken. Leerlingen die vertrekken kan je archiveren.
- **Importeren uit Excel (.xlsx)**:
  - De app zoekt per tabblad de leerlingen (kolom B), de rij met de maxima (label `Totaal`) en de kolommen met punten.
  - Een kolom met een percentage of totaalformule wordt overgeslagen.
  - Voor je importeert, kan je per tabblad de klas, het vak, de namen van de evaluaties en de maxima nakijken en aanpassen.
  - Importeer je een tabblad opnieuw, dan wordt het puntenboek aangevuld (of desgewenst vervangen). Leerlingen worden op naam herkend.
- **Exporteren naar Excel**: één tabblad per klas en vak, met een werkende percentageformule. Dat bestand kan je ook opnieuw importeren.
- **Back-up**: volledige back-up als .json downloaden en terugzetten.
- **Ongedaan maken**: via de melding onderaan, of Ctrl+Z buiten een invulvak.

## Waar staan de gegevens?

Standaard bewaart de app alles **in de browser** van het toestel dat je gebruikt (localStorage). Er gaat dan niets naar een server.
Wil je dezelfde gegevens op school en thuis gebruiken, schakel dan de **online synchronisatie met Supabase** in (zie verder). Maak in elk geval regelmatig een back-up via **Gegevens**.

> Het gaat om punten van minderjarige leerlingen: zet de GitHub-repository op *Private* en deel de link van de site niet. De site vraagt zoekmachines om niet te indexeren.

## Online zetten met Vercel

1. Ga naar [vercel.com](https://vercel.com) en meld je aan met GitHub.
2. Kies **Add New… → Project** en importeer de repository `klasbeheer`.
3. Laat de instellingen zoals ze zijn. Het framework staat op *Other*, en de build gebeurt via `vercel.json` (`npm run build`, map `dist`).
4. Klik op **Deploy**. Na ongeveer een minuut krijg je een adres zoals `klasbeheer-xxx.vercel.app`.

Elke nieuwe commit op `main` wordt automatisch opnieuw gepubliceerd.

## Online synchronisatie met Supabase (optioneel, gratis)

Hiermee log je in met e-mail en wachtwoord, en worden je gegevens online bewaard en tussen toestellen gesynchroniseerd.

1. Maak een gratis account op [supabase.com](https://supabase.com) en daarna een **New project**. Kies als regio een EU-regio, bv. *Frankfurt* of *Ireland*.
2. Open **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**. Dat maakt de tabel aan. Ze is beveiligd met Row Level Security: elke gebruiker ziet enkel zijn eigen gegevens.
3. Ga naar **Project Settings → API** en kopieer de **Project URL** en de **anon public key**.
4. Kies één van deze twee manieren:
   - **In Vercel** (aangeraden): ga naar je project → **Settings → Environment Variables** en voeg `SUPABASE_URL` en `SUPABASE_ANON_KEY` toe. Kies daarna **Deployments → … → Redeploy**.
   - **In de app**: ga naar **Gegevens → Online synchroniseren** en vul ze daar in. Dat geldt dan enkel voor die browser.
5. Ga in de app naar **Gegevens**, kies **Account aanmaken** en bevestig je e-mailadres. Meld je daarna aan.
6. Zet in Supabase bij **Authentication → Sign In / Providers** de optie *Allow new users to sign up* uit zodra je account bestaat. Zo kan niemand anders een account maken.

Bij de eerste aanmelding worden je lokale gegevens online gezet. Op een tweede toestel krijg je na het aanmelden automatisch dezelfde gegevens.
Wijzig je op twee toestellen tegelijk, dan wint de recentste versie. De andere versie blijft als reservekopie beschikbaar onder **Gegevens**.

## Lokaal ontwikkelen

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # productiebuild in ./dist
npm test        # test de Excel-import en -export
npm test -- pad/naar/Puntenboek.xlsx   # test met je eigen bestand
```

De app is gebouwd met React en esbuild. Excel-bestanden worden in de browser gelezen en geschreven met JSZip, zonder externe Excel-bibliotheek.

### Structuur

```
src/
  lib/types.ts        datamodel (klassen, leerlingen, puntenboeken, evaluaties, punten)
  lib/calc.ts         berekeningen (percentage enkel over ingevulde evaluaties) en opmaak
  lib/store.ts        opslag in de browser, acties, ongedaan maken
  lib/xlsx.ts         .xlsx lezen en schrijven
  lib/importer.ts     herkenning van puntenboeken in een Excel-bestand
  lib/exporter.ts     export naar Excel
  lib/sync.ts         optionele synchronisatie met Supabase
  pages/              schermen (overzicht, evaluaties, klas, puntenboek, leerling, import, gegevens)
supabase/schema.sql   tabel + beveiliging voor de synchronisatie
```
