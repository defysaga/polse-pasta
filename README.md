# Pølse & Pasta

En app for to: samle matvideoer fra TikTok og Instagram Reels, logge middagene dere lager med bilder og rating, holde en liste over restauranter dere vil prøve, sende hverandre søte pølsehund-plinger som kommer som varsler på telefonen, og ta vare på en felles pølsehund med streak, spill og couple quiz.

Appen er en **PWA**: en nettside som legges på hjemskjermen og oppfører seg som en vanlig app, med eget ikon, fullskjerm, push-varsler og tall på ikonet.

## Slik henger det sammen

```
 iPhone (Mads)  ⇄                                  ⇄  iPhone (madammen)
                   Cloudflare Worker  ─→  Apple  ─→
                   (appen + API + database)
```

- **Cloudflare Worker** viser appen og har et lite API under `/api/`. Alt ligger på én adresse.
- **Databasen** er en Durable Object med SQLite hos Cloudflare: oppskrifter, middager, restauranter, plinger, personer og bildene.
- **Push-varsler:** når noen sender en pling, sender serveren varselet til den andres telefon med en gang (Web Push via Apple). Tittelen er alltid «Voff!», og teksten er meldingen. Linjen «fra Pølse&Pasta» legger iPhone til selv, og den kan ikke fjernes.
- **Påminnelser:** hver halvtime sjekker serveren om hunden har fått mat i dag. Hvis ikke, får begge et varsel på tidspunktene dere har valgt (cron i `wrangler.toml`).
- **Oppskrifter:** serveren sender teksten som står til videoen (og notatet deres) til Cloudflare sin AI (Workers AI, modellen Llama 3.3 70B), som skriver ingredienser og steg på norsk. Gratiskvoten holder til mange titalls oppskrifter om dagen. AI brukes ikke til bilder.
- **Forhåndsvisning:** serveren henter bilde og tittel for TikTok-lenker (TikTok sitt oEmbed) og Instagram-lenker (den offentlige embed-siden), og lagrer bildet hos seg. For Google Maps og Apple Kart leses navnet på stedet rett fra lenken (kortlenker følges), og for andre nettsider hentes tittelen. Serveren henter aldri fra interne adresser.
- **Husnøkkelen** holder appen privat. Den lages første gang appen åpnes, og begge skriver den inn én gang.
- **GitHub → Cloudflare:** hver gang koden i `main` endres, legger Cloudflare den ut på nytt av seg selv.

Alt er gratis innenfor Cloudflare sine gratisgrenser (5 GB lagring og 100 000 forespørsler om dagen), som er langt mer enn to personer bruker.

## Filene

| Fil | Hva den gjør |
|---|---|
| `src/worker.js` | Serveren: API, database, bilder og push-varsler. |
| `wrangler.toml` | Forteller Cloudflare hva Workeren heter, hvor appens filer ligger og at den bruker en Durable Object. |
| `public/index.html` | Strukturen i appen. |
| `public/app.css` | Utseendet. Lys og mørk modus følger telefonen. |
| `public/app.js` | Logikken: viser alt, lagrer endringer, sender plinger, slår på varsler. |
| `public/polsa-emoji.js` | Pølsa-emojiene: Pølsa tegnet i ulike uttrykk for hver pling, og Pølsa med mat til kort uten bilde. |
| `public/game.js` | Pølsehopp-spillet (tegnes på et canvas). |
| `public/quiz-data.js` | Spørsmålene til couple quizen. Legg gjerne til flere. |
| `public/sw.js` | Service worker: lagrer appen på telefonen så den åpner uten nett, og viser varslene. |
| `public/manifest.webmanifest` | Navn, ikon og fullskjerm når appen ligger på hjemskjermen. |
| `public/icons/` | App-ikonene (lages med `scripts/make-icons.mjs`). |
| `test/` | Tester som kjører serveren og appen lokalt. Brukes ikke av Cloudflare. |

## Oppsett (allerede gjort)

1. Repoet `polse-pasta` på GitHub.
2. Cloudflare: **Workers & Pages → Create → Import a repository** → `polse-pasta`. Navnet må være `polse-pasta`, samme som i `wrangler.toml`.

Appen ligger på **https://polse-pasta.mads-lunde-sorensen.workers.dev**.

## Komme i gang på iPhone

1. Åpne adressen i **Safari**.
2. Trykk **Del** (firkanten med pil opp) → **Legg til på Hjem-skjerm** → **Legg til**.
3. Åpne **Pølse&Pasta** fra hjemskjermen.
4. Første gang: lag husnøkkelen (bare den første som åpner appen), skriv navnet ditt, og trykk **Slå på varsler**.
5. Madammen gjør det samme, men skriver inn husnøkkelen i stedet for å lage en ny. Under innstillinger (trykk på bokstavene oppe til høyre) finner du **Del appen**, som sender henne adressen og nøkkelen.

Varsler på iPhone krever iOS 16.4 eller nyere, og at appen er åpnet fra hjemskjermen. Appen på hjemskjermen husker ikke det du skrev i Safari, så skriv husnøkkelen inn i appen på hjemskjermen.

## Funksjoner

- **Startsiden (Hjem):** appen åpner alltid her, også når du kommer tilbake etter en stund. Øverst er Pølsa, så plingene, quizen, plinger dag for dag og Pølsehopp.
- **Pølsa:** den felles hunden deres (navnet kan endres under ⋯). Én av dere må gi mat hver dag, ellers ryker streaken. Uka vises fra mandag til venstre til søndag til høyre, med forbokstaven til den som ga mat, og en gul strek mellom dager på rad. Får hunden ikke mat, kommer det varsel kl. 18.00 og 21.30 (kan endres eller skrus av). Etter maten kan dere gi godbiter.
- **Pling:** Klem og Kyss er hovedvalgene og sendes med ett trykk. Under hver av dem ligger varianter: Bamseklem, Lang klem, Trøsteklem og Savner deg, og Slengkyss, Kyss på kinnet, Nesekyss og Elsker deg. Under dem er **På vei hjem**, med knapper for 10, 20 og 30 minutter («Hjemme om ca. 20 min»). Resten (hilsen, sulten, middagen er klar, kan du handle, god natt og egen melding) ligger under «Flere plinger». Alle plingene har sin egen Pølsa-emoji, tegnet for appen. Plingen kommer som varsel på låseskjermen («Voff!» og meldingen, f.eks. «Kari er på vei hjem! Hjemme om ca. 20 min.»), og når appen er åpen trasker en pølsehund inn på skjermen. «Svar» tar deg til plingene på startsiden.
- **Plinger dag for dag:** én rad per dag med Pølsa-emojiene til hver av dere. Trykk på en dag for å se klokkeslett og meldinger.
- **Couple quiz:** «Hvem av oss?» (begge svarer, og dere ser om dere er enige), «Kjenner du meg?» (tilfeldig spørsmål om deg som den andre gjetter) og egne spørsmål, med eller uten svaralternativer. Den som får spørsmålet, får en pling, og poengene samles.
- **Pølsehopp:** en liten rad nederst på startsiden. Hopp over kongler, brannhydranter, katter og vannpytter, og samle pølser. Banen er lik for dere begge hver dag. Tar du ledelsen, får den andre en pling.
- **Inspo:** lim inn lenker fra TikTok og Reels (delingsteksten fra appene renses bort), gi dem navn, notat og merkelapper. Filtrer på «Vil lage», «Laget», TikTok, Reels eller merkelapp, og søk på navn, ingrediens eller merkelapp.
- **Lim inn fra Notater:** har dere samlet lenker i et notat, trykk «Mange på en gang? Lim inn fra Notater» (i Inspo og Restaurant). Kopier fra Notater og lim inn: hver lenke blir et eget kort, og teksten på linjen over (eller navnet på lenken) blir navnet. I Restaurant blir linjer uten lenke lagt inn som steder. Det som allerede er lagret, hoppes over, og dere kan ta bort det dere ikke vil ha før dere trykker «Legg til».
- **Merkelapper:** velg blant de faste, eller trykk «+ Annet» og skriv deres egne (flere med komma). Egne merkelapper dukker opp som valg neste gang, både i Inspo og Middager. Restaurantene har egne merkelapper (Italiensk, Asiatisk, Sushi, Brunch, Date night, Billig osv.).
- **Bilde på kortene:** bildet fra TikTok- eller Instagram-videoen hvis det kan hentes. Ellers et Pølsa-bilde: Pølsa som holder maten, valgt ut fra ordene i navnet (pasta, pizza, taco, burger, sushi, suppe, fisk, kake, kaffe osv.), foran en stor, dempet utgave av den samme maten. For restauranter brukes også merkelappene (Italiensk gir pasta, Meksikansk gir taco). Under «Endre» kan dere bruke et eget bilde eller gå tilbake til Pølsa-bildet. Har dere laget retten og lagt inn et bilde i Middager, vises deres eget bilde.
- **Oppskrift fra videoen:** trykk på et kort i Inspo og så **Lag oppskrift**. Appen leser teksten som står til videoen og lager ingredienser og steg for to. Dere kan også skrive eller rette oppskriften selv.
- **Middager:** skriv hva dere lagde (navnene fra Inspo foreslås mens du skriver), legg til bilde og stjerner. Dato, kommentar, «lage igjen?» og merkelapper ligger under «Flere detaljer». Søk og filtrer på merkelapp. Øverst ser dere antall middager, snittet og favoritten.
- **Restaurant:** steder dere vil prøve. Lim inn lenken fra Google Maps, Apple Kart, Instagram eller nettsiden, så fylles navnet inn av seg selv, eller skriv bare navnet. Legg til område, merkelapper og notat. Når dere har vært der, trykk «Vi har vært her» og gi stjerner, «Gå igjen?» og en kommentar hver. Filtrer på «Vil prøve» og «Har vært», og søk på navn, sted eller merkelapp. «Åpne i kart» åpner lenken, eller søker opp stedet i Kart hvis det ikke har lenke.
- **Handleliste:** felles liste der det én krysser av, blir krysset av hos den andre også. Legg i varer fra oppskriftene, skriv flere på én gang («melk, 2 pk smør»), eller trykk på «Ofte kjøpt» for det dere pleier å kjøpe. Del eller kopier listen, og send den med «Kan du handle?»-plingen.
- **Menyen** nederst har fem faner: Hjem, Inspo, Middager, Restaurant og Handle. Linsen glir til fanen du velger, du kan dra fingeren over menyen for å bytte fane, og den krymper til en liten knapp når du scroller nedover.
- **Tall på app-ikonet:** antall plinger du ikke har sett. Tallet på Hjem-fanen teller også quizrunder der det er din tur, og om Pølsa mangler mat.
- **Uten nett:** appen åpner og viser alt den har hentet før. Det du legger inn, sendes når du er på nett igjen. Bilder krever nett.

## Når koden endres

Endringer som legges i `main` på GitHub, legges ut av Cloudflare etter et minutt eller to. Under **Workers & Pages → polse-pasta → Deployments** ser du om det gikk bra. Appen henter de nye filene neste gang den åpnes med nett.

## Prøve lokalt

```
node --no-warnings test/test-worker.mjs   # serveren, databasen og krypteringen av varsler
node --no-warnings test/e2e.mjs            # to personer bruker appen samtidig i hver sin nettleser
node --no-warnings test/dev-server.mjs     # kjør appen på http://localhost:8787
```

Testene bruker Node 22 (med innebygd SQLite) og Playwright.

## Hvis noe ikke virker

- **Ingen varsler:** åpne innstillinger i appen og trykk **Send testvarsel til meg**. Står det at varsler er blokkert: iPhone-innstillinger → Varslinger → Pølse&Pasta.
- **«fra Pølse&Pasta» i varslene:** den linjen legger iPhone til på alle varsler fra apper som er lagt til fra Safari. Appen kan ikke fjerne den.
- **Glemt husnøkkelen:** den står under innstillinger i appen på den andre telefonen.
- **Feil i serveren:** Cloudflare → Workers & Pages → polse-pasta → **Logs**.
