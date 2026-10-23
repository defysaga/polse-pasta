# Pølse & Pasta

En app for to: samle matvideoer fra TikTok og Instagram Reels, logge middagene dere lager med bilder og rating, sende hverandre søte pølsehund-plinger som kommer som varsler på telefonen, og ta vare på en felles pølsehund med streak, spill og couple quiz.

Appen er en **PWA**: en nettside som legges på hjemskjermen og oppfører seg som en vanlig app, med eget ikon, fullskjerm, push-varsler og tall på ikonet.

## Slik henger det sammen

```
 iPhone (Mads)  ⇄                                  ⇄  iPhone (madammen)
                   Cloudflare Worker  ─→  Apple  ─→
                   (appen + API + database)
```

- **Cloudflare Worker** viser appen og har et lite API under `/api/`. Alt ligger på én adresse.
- **Databasen** er en Durable Object med SQLite hos Cloudflare: oppskrifter, middager, plinger, personer og bildene.
- **Push-varsler:** når noen sender en pling, sender serveren varselet til den andres telefon med en gang (Web Push via Apple).
- **Påminnelser:** hver halvtime sjekker serveren om hunden har fått mat i dag. Hvis ikke, får begge et varsel på tidspunktene dere har valgt (cron i `wrangler.toml`).
- **Oppskrifter:** serveren sender teksten som står til videoen (og notatet deres) til Cloudflare sin AI (Workers AI, modellen Llama 3.3 70B), som skriver ingredienser og steg på norsk. Gratiskvoten holder til mange titalls oppskrifter om dagen.
- **Forhåndsvisning:** serveren henter bilde og tittel for TikTok-lenker (TikTok sitt oEmbed) og Instagram-lenker (den offentlige embed-siden), og lagrer bildet hos seg.
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

- **Inspo:** lim inn lenker fra TikTok og Reels (delingsteksten fra appene renses bort), gi dem navn, notat og merkelapper. Filtrer på «Vil lage», «Laget», TikTok eller Reels, og søk når listen blir lang. Når dere har laget en rett, blir deres eget bilde forsiden på kortet.
- **Middager:** dato, bilder, stjerner, «lage igjen?» og kommentar fra hver av dere. Øverst ser dere antall middager, snittet og favoritten. Sorter på nyeste eller best rangert, eller vis bare dem du ikke har ratet.
- **Pling:** pølsehund-hilsen, jeg er sulten, middagen er klar, kan du handle (med handleliste), klem, kyss, god natt og egen melding. Plingen kommer som varsel på låseskjermen, og når appen er åpen trasker en pølsehund inn på skjermen. Mottakeren kan svare med en klem med ett trykk.
- Det sendes også en pling når du lagrer en ny oppskrift (hvis du vil), og når du ber den andre om å rate en middag («Mas om rating»).
- **Pølsa:** den felles hunden deres (navnet kan endres). Én av dere må gi mat hver dag, ellers ryker streaken. Du ser streaken, beste streak og hvem som ga mat de siste 14 dagene, og kan gi godbiter. Får hunden ikke mat, kommer det varsel kl. 18.00 og 21.30 (kan endres eller skrus av).
- **Pølsehopp:** hopp over kongler, brannhydranter, katter og vannpytter, og samle pølser. Fuglene flyr der du hopper, så der må du bli på bakken. Banen er lik for dere begge hver dag. Tar du ledelsen, får den andre en pling.
- **Couple quiz:** «Hvem av oss?» (begge svarer, og dere ser om dere er enige), «Kjenner du meg?» (tilfeldig spørsmål om deg som den andre gjetter) og egne spørsmål, med eller uten svaralternativer. Den som får spørsmålet, får en pling, og poengene samles.
- **Forhåndsvisning av videoer:** lim inn en lenke, så hentes bilde og tittel av seg selv. Trykk på kortet for å se videoen i appen. TikTok virker best. For Instagram kommer bildet frem når Instagram tillater det.
- **Oppskrift fra videoen:** trykk på et kort i Inspo og så **Lag oppskrift**. Appen leser teksten som står til videoen og lager ingredienser og steg for to. Står ikke alt i teksten, foreslår den en vanlig oppskrift på retten og sier fra om det. Dere kan også skrive eller rette oppskriften selv.
- **Handleliste:** huk av det dere trenger i oppskriften og trykk **Legg i handlelisten**. Listen er felles, så det én krysser av i butikken, blir krysset av hos den andre også. Like varer slås sammen. Del eller kopier listen til Notater eller appen til butikken, og send den med «Kan du handle?»-plingen.
- **Menyen** nederst er en svevende glass-meny, som i Radar. Linsen glir til fanen du velger, og du kan holde inne og dra fingeren over menyen for å bytte fane. Når du scroller nedover, krymper den til en liten knapp. Trykk på den, eller scroll helt opp, for å få menyen tilbake. Hver fane husker hvor langt ned du var, og trykker du på fanen du allerede står i, går du til toppen.
- **Tall på app-ikonet:** antall plinger du ikke har sett.
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
- **Glemt husnøkkelen:** den står under innstillinger i appen på den andre telefonen.
- **Feil i serveren:** Cloudflare → Workers & Pages → polse-pasta → **Logs**.
