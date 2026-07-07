# Chiaro — Guida agli screenshot store

## Formati richiesti

### App Store (iOS) — obbligatori
| Dispositivo | Risoluzione (px) | Quanti |
|---|---|---|
| iPhone 6.9" (15/16 Pro Max) | 1320 × 2868 | 3–10 (almeno 3) |
| iPhone 6.5" (11 Pro Max/XS Max) | 1242 × 2688 | 3–10 |
| iPad 13" (se pubblichi anche su iPad) | 2064 × 2752 | opzionale |

> Da Xcode/Simulator puoi catturare alle risoluzioni esatte. Apple accetta anche solo il 6.9".

### Google Play (Android)
| Asset | Risoluzione |
|---|---|
| Screenshot telefono | min 1080 px lato lungo, 2–8 immagini |
| Icona | 512 × 512 (`store/graphics/playstore-icon-512.png`) ✅ generata |
| Feature graphic | 1024 × 500 (`store/graphics/playstore-feature-graphic-1024x500.png`) ✅ generata |

## Le 6 schermate da catturare (in quest'ordine)
1. **Home** — l'orb Chiaro + "Non ti fregano più" → impatto/branding
2. **Scelta metodo** — "Come vuoi analizzare?" (Scatta / Carica / Inquadra live)
3. **Risultato** — titolo, semaforo "Attento", LX Complexity Score, pulsante Ascolta
4. **Approfondimento** — "Cosa succede nella pratica / È normale? / Tenere a mente"
5. **Scadenziario** — date e importi estratti
6. **Chiaro Eyes** — analisi live (oppure Radar)

## Suggerimento caption (sovrapposte allo screenshot)
1. "Capisci qualsiasi documento"
2. "Foto, PDF o live: come preferisci"
3. "Semaforo del rischio + spiegazione semplice"
4. "Tutti i dettagli, in parole tue"
5. "Mai più scadenze dimenticate"
6. "Inquadra e capisci, in tempo reale"

## Come catturarli velocemente
- In sviluppo/preview imposta il viewport a 1320×2868 (o 1080×2340 per Android) e cattura ogni schermata.
- In alternativa, usa il Simulatore iOS (`Cmd+S`) e l'emulatore Android: danno screenshot già nei formati store.
- Mantieni i dati demo coerenti (l'esempio "Lettera di incarico" / "Consenso informato" rende bene).
