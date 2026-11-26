# Kair.OS — flight tracker per Android e Wear OS (Galaxy Watch)

App nativa Kotlin in due versioni, telefono e orologio (Galaxy Watch 9 / Wear OS 6, compatibile Wear OS 3+),
con logica condivisa.

```
kairos/
├── core/          logica condivisa: voli live, import Gmail, avvisi, "quando partire", scioperi
├── mobile/        app Android telefono (Material 3)
├── wear/          app Wear OS: app, tile, complicazione quadrante, Ongoing Activity
└── gmail-bridge/  Apps Script che estrae i voli dalla tua Gmail (vedi il suo README)
```

## Funzioni

| Area | Cosa fa | Dove |
|---|---|---|
| Import automatico | Voli da Gmail: numero, data, orari, aeroporti, **posto, gruppo, imbarco, chiusura gate, terminal, classe, PNR** | tel + watch |
| Stato live | Orari previsti/effettivi, ritardo, terminal, gate, nastro bagagli, aereo, matricola | tel + watch |
| Avvisi | Ritardo/anticipo (≥10'), cambio gate/terminal, imbarco, gate chiuso, decollo, atterraggio, nastro, cancellazione, dirottamento, nuovo volo da Gmail, carta d'imbarco arrivata | tel + watch |
| **Quando partire** | Ora di uscita calcolata all'indietro dal gate: viaggio con **traffico previsto** (o **mezzi pubblici**), margine, bag drop, controlli (fast track), passaporti extra-Schengen, **tempo lounge (LoungeKey)**; usa la chiusura gate della carta d'imbarco se c'è | tel + watch |
| **Scioperi** | Incrocia gli scioperi MIT del giorno del volo: settore aereo (nazionale/regionale), **la tua compagnia**, treni/TPL se vai coi mezzi, taxi; aggiunge 30' e avvisa | tel + watch |
| Notifiche viaggio | "Preparati" 30' prima, "Esci ora", "Sciopero" | tel + watch |
| Live | Notifica continua con avanzamento (tel), Ongoing Activity (watch) | tel + watch |
| Quadrante | Tile "Prossimo volo" (stato, countdown, gate, ora di uscita, posto) + complicazione countdown | watch |
| Statistiche | Voli, km, ore, aeroporti, compagnie | tel |
| Demo | Senza chiavi gira con voli simulati | tel + watch |

## Chiavi (in `local.properties`, mai nel repo)

```
sdk.dir=/percorso/android-sdk
AERODATABOX_KEY=...     # RapidAPI AeroDataBox. Vuoto = DEMO. Free 400 unità/mese; Pro $8/5.000
GMAIL_BRIDGE_URL=...    # vedi gmail-bridge/README.md
GOOGLE_MAPS_KEY=...     # Google Routes API (abilita "Routes API"); limita la chiave al package
```

## Build e installazione

```bash
cd kairos
./gradlew :mobile:assembleDebug :wear:assembleDebug
adb install mobile/build/outputs/apk/debug/mobile-debug.apk
# Orologio: Impostazioni > Opzioni sviluppatore > Debug ADB + Debug Wi-Fi
adb connect <IP_OROLOGIO>:<PORTA>
adb -s <IP_OROLOGIO>:<PORTA> install wear/build/outputs/apk/debug/wear-debug.apk
```
Le due app hanno lo stesso `applicationId` (requisito Google Play per le app Wear abbinate).

Sul telefono: Impostazioni ⚙ → indirizzo di partenza, mezzo (auto, taxi, mezzi), lounge sì/no e minuti,
fast track, bagaglio. Sul watch: tile "Prossimo volo" e complicazione "Countdown volo".

## Fonti dati e costi

| Dato | Fonte | Costo |
|---|---|---|
| Stato voli | AeroDataBox (RapidAPI) | Free 400 unità/mese → poi da $8/mese |
| Viaggio + traffico/mezzi | Google Routes API | Quota gratuita mensile SKU Pro; l'app ricalcola ogni 3h → 30' → 10' avvicinandosi all'uscita |
| Scioperi | MIT via onData, **CC BY 4.0** (attribuzione presente in app) | gratis |
| Email | La tua Gmail via Apps Script | gratis |
| Tempi in aeroporto / lounge | Tabella Kair.OS per tipo di scalo (32 aeroporti), modificabile | — |

## Limiti noti e prossimi passi
1. **Refresh**: Android impone 15' minimi in background. Per avvisi "al minuto" serve un piccolo backend con push
   (FCM) che tenga anche le chiavi API fuori dall'APK. Consigliato prima di distribuire l'app ad altri.
2. **Sincronizzazione telefono ↔ orologio**: oggi ognuno legge Gmail e i dati live per conto suo.
   Le impostazioni di viaggio si configurano sul telefono; il watch usa i default (Wear Data Layer = step successivo).
3. **Where's my plane** (aereo in arrivo) e **previsione ritardi**: possibili con AeroDataBox (`/flights/reg/...`, statistiche ritardi).
4. **Lounge**: LoungeKey non ha API pubbliche; l'app usa il tempo per aeroporto e apre il lounge finder.
5. **Attese ai controlli**: nessuna API ufficiale per FCO/MXP/LIN/LHR; si usano stime per tipo di scalo.
6. Voli da email non ancora coperti dall'API (es. fra molti mesi): restano "solo email" e diventano live da soli.

## Note legali (per uso personale → distribuzione)
- Nome, grafica e codice sono originali; le funzioni (non proteggibili in sé) sono comuni ai tracker di voli.
- Prima di pubblicare: verifica i ToS commerciali di AeroDataBox/Google (cache, display, attribuzione "Google"),
  privacy policy (dati di viaggio e PNR = dati personali GDPR), verifica OAuth Google per Gmail (scope restricted).
