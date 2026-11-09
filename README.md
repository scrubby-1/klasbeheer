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
- **Back-up**: volledige back-up als .json downloaden en terugzetten. Een back-up bevat leerlinggegevens: bewaar ze veilig.
- **Account**: aanmelden, wachtwoord wijzigen of herstellen via e-mail, en afmelden.
- **Ongedaan maken**: via de melding onderaan, of Ctrl+Z buiten een invulvak.

## Demoversie

Wie de app wil uitproberen, heeft geen account nodig. Klik op het aanmeldscherm op **Demo bekijken**, of deel de link `https://<jouw-site>.vercel.app/?demo`.

- De demo bevat drie fictieve klassen (Demo 4A, 5B en 6C) met verzonnen leerlingen, puntenboeken, evaluaties en klasplannen.
- Alles werkt zoals in de echte versie: punten invullen, evaluaties toevoegen, importeren, exporteren en het klasplan.
- De demo draait volledig in de browser van de bezoeker. Er wordt **nooit** iets naar Supabase gestuurd of daar opgehaald. Je echte gegevens zijn vanuit de demo dus niet bereikbaar.
- De gegevens verdwijnen wanneer het tabblad gesloten wordt. Met **Opnieuw beginnen** start je opnieuw met de originele demogegevens.

Wil je toch een echt testaccount, met online opslag? Maak dan in Supabase een extra gebruiker aan en zet die op de toegangslijst. Elke gebruiker ziet enkel zijn eigen gegevens. Meld je daarna aan met dat account en kies **Gegevens → Demogegevens inladen**. Die knop verschijnt enkel bij een leeg account.

## Beveiliging

De app is enkel bruikbaar na aanmelden. De gegevens staan in een eigen Supabase-database en zijn op meerdere niveaus afgeschermd.

1. **Geen registratie.** Je maakt je account zelf aan in Supabase en zet registreren daar uit. De app heeft geen knop om een account te maken.
2. **Row Level Security.** De database geeft een aangemelde gebruiker enkel zijn eigen gegevens.
3. **Toegangslijst.** Daarbovenop moet je e-mailadres in de tabel `klasbeheer_beheerders` staan. Een account dat daar niet in staat, krijgt geen enkele rij te zien en wordt meteen afgemeld. Zelfs als registreren per ongeluk aan zou staan, kan niemand anders dus aan de gegevens.
4. **Geen rechten voor niet-aangemelde bezoekers.** De publieke *anon key* in de website geeft zonder aanmelding geen toegang tot de tabellen.
5. **Gedeelde computer.** Standaard bewaart de browser niets blijvends: bij het sluiten van de browser, bij afmelden of na 30 minuten zonder activiteit worden de sessie en de lokale kopie gewist.
   - Enkel met *Aangemeld blijven op dit toestel* (voor je eigen computer) blijft een kopie in de browser staan, tot je afmeldt.
6. **Website.** Strikte beveiligingsheaders (Content-Security-Policy, geen inbedding in andere sites, geen indexering door zoekmachines) en enkel HTTPS.

De code op GitHub bevat geen leerlinggegevens en geen geheimen. De anon key staat enkel in Vercel en is bovendien bedoeld om publiek te zijn.

## Installatie (eenmalig)

### 1. Supabase-project

1. Maak een gratis account op [supabase.com](https://supabase.com) en daarna een **New project**.
   - Kies een EU-regio, bv. *Frankfurt (eu-central-1)*.
   - Kies een sterk databasewachtwoord en bewaar het.
2. Open **SQL Editor → New query**, plak de volledige inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Voer in een nieuwe query deze regel uit, met jouw e-mailadres:
   ```sql
   insert into public.klasbeheer_beheerders (email) values ('jouw.adres@voorbeeld.be');
   ```
4. Ga naar **Authentication → Users → Add user → Create new user**.
   - Vul hetzelfde e-mailadres en een sterk wachtwoord in (minstens 10 tekens).
   - Vink **Auto Confirm User** aan.
5. Ga naar **Authentication → Sign In / Providers** en zet **Allow new users to sign up** uit. Klik op **Save**.
6. Ga naar **Authentication → URL Configuration**.
   - Zet de **Site URL** op het adres van je Vercel-site, bv. `https://klasbeheer-xxx.vercel.app`.
   - Voeg datzelfde adres toe bij **Redirect URLs**.
   - Dit is nodig voor de link bij *Wachtwoord vergeten*.
7. Ga naar **Project Settings → API** (of **Data API**) en kopieer de **Project URL** en de **anon public** key. Gebruik nooit de *service_role* key in de website.

### 2. Vercel

Heb je nog geen Vercel-project, ga dan naar [vercel.com](https://vercel.com), meld je aan met GitHub, kies **Add New → Project**, importeer `klasbeheer` en klik op **Deploy**. De build-instellingen staan al in `vercel.json`.

1. Ga naar je project in Vercel → **Settings → Environment Variables** en voeg twee variabelen toe:
   - `SUPABASE_URL`: de Project URL
   - `SUPABASE_ANON_KEY`: de anon public key
2. Ga naar **Deployments**, klik op de drie puntjes bij de bovenste deployment en kies **Redeploy**.
3. Optioneel, maar aangeraden: zet bij **Settings → Deployment Protection** *Vercel Authentication* aan voor *Preview Deployments*. Zo zijn testversies enkel voor jou zichtbaar.

Open daarna de site en meld je aan. Had je eerder al gegevens geïmporteerd in de versie zonder aanmelding, dan worden die bij je eerste aanmelding in deze browser automatisch online bewaard en daarna uit de browser gewist.

## Werken op meerdere toestellen

Elke wijziging wordt na ongeveer een seconde online bewaard. Op een ander toestel meld je je gewoon aan.
Wijzig je op twee toestellen tegelijk, dan wint de recentste versie. De andere versie blijft als reservekopie beschikbaar onder **Gegevens**.

## Iemand de toegang ontnemen of een account verwijderen

- **Toegang ontnemen:** `delete from public.klasbeheer_beheerders where email = '...';`
- **Account en gegevens verwijderen:** Authentication → Users → het account → *Delete user*. De gegevens worden dan mee verwijderd.

## Lokaal ontwikkelen

```bash
npm install
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm run dev     # http://localhost:5173
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
  lib/sync.ts         aanmelden, toegangscontrole en synchronisatie met Supabase
  pages/              schermen (overzicht, evaluaties, klas, puntenboek, leerling, import, gegevens)
supabase/schema.sql   tabellen, toegangslijst en Row Level Security
```
