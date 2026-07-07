# Chiaro — Non ti fregano più! 🛡️

Fotografa o carica un documento (contratto, polizza, termini, bolletta…): **Chiaro** te lo
spiega in parole semplici, ti legge l'analisi a voce e ti avvisa con un semaforo 🟢🟠🔴
se c'è una fregatura. Estrae anche le scadenze e confronta documenti.

Ricostruzione e potenziamento di GLINT, pronta per il mercato.

## Stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind v4**
- **Claude** (Anthropic SDK) — analisi reale con vision nativa su foto/PDF, streaming JSONL
- **Web Speech API** — sintesi vocale gratuita (TTS)
- **Supabase** — auth (magic link), DB, storage *(opzionale, già predisposto)*
- **PWA** installabile · **Capacitor** per l'app nativa iOS/Android
- Deploy: **Render**

## Sviluppo

```bash
npm install
npm run dev          # http://localhost:3000
```

Senza chiavi l'app gira in **modalità demo** (analisi mock realistica), così puoi navigare
tutto il flusso. Per l'AI reale crea `.env.local` (vedi `.env.example`):

```bash
ANTHROPIC_API_KEY=sk-ant-...        # unica cosa indispensabile per l'AI reale
# Opzionali (login + cloud):
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> ⚠️ Non committare mai `.env.local`. La key di Claude ha un costo a consumo (pochi
> centesimi a documento; uso Sonnet per l'analisi e Haiku per i task leggeri).

## Struttura

```
src/
  app/
    page.tsx                 Home
    login/                   Auth (magic link / demo)
    analyze/                 Cattura (upload + fotocamera) → streaming → salvataggio
    eyes/                    Chiaro Eyes (analisi live)
    document/[id]/           Risultato + approfondimento
    documents/               Lista documenti
    tools/                   radar · compare · deadlines · calendar
    settings/                Impostazioni + lingua
    tutorial/                Onboarding
    api/analyze/             Route streaming (Claude, JSONL)  + fallback mock
    api/compare/             Confronto documenti
  components/                UI, sheet, nav, orb, risultato…
  lib/
    anthropic.ts             Client + tiers modello
    analysis/                extract · prompt · stream · types · mock
    supabase/                client · server · (proxy in src/proxy.ts)
    store.ts                 Persistenza (localStorage; pronta per Supabase)
```

## Supabase (quando vuoi login + cloud)

1. Crea un progetto su supabase.com.
2. SQL editor → incolla ed esegui `supabase/schema.sql`.
3. Metti le 3 chiavi in `.env.local` (o nelle env di Render).

## Deploy su Render

1. Push del repo.
2. Render → **New → Blueprint**, seleziona il repo, **Root Directory = `flip`**
   (usa `render.yaml`).
3. Imposta le env (almeno `ANTHROPIC_API_KEY`, e `NEXT_PUBLIC_SITE_URL` = URL Render).
4. Deploy. Service Node always-on: nessun timeout sull'analisi.

## App nativa (Capacitor → App Store / Play Store)

L'app nativa carica l'app già deployata (così l'AI resta server-side) e usa la
fotocamera in-webview (lo scanner e Chiaro Eyes funzionano già su iOS/Android).

```bash
# 1. Deploy su Render e prendi l'URL, poi:
export Chiaro_APP_URL=https://<tuo-url>.onrender.com

# 2. Genera i progetti nativi (serve Xcode per iOS, Android Studio per Android)
npx cap add ios
npx cap add android
npx cap sync

# Icone + splash (sorgenti già generate in assets/ via `node scripts/generate-assets.mjs`)
npx capacitor-assets generate

# 3. Apri e compila
npx cap open ios       # → Xcode: firma con il tuo Apple Developer account, archivia
npx cap open android   # → Android Studio: build → bundle/APK
```

Permessi da aggiungere (li trovi commentati nella guida sotto):
- **iOS** `ios/App/App/Info.plist`: `NSCameraUsageDescription` = "Chiaro usa la fotocamera per leggere i tuoi documenti."
- **Android** `android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA"/>`

> La pubblicazione richiede i tuoi account sviluppatore (Apple 99$/anno, Google 25$
> una tantum). Il progetto è pronto: serve solo firmare e caricare.

---

Chiaro · *Non ti fregano più.*
