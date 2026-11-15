# Agente personale — vincoli di progetto

Questo repository (root: `server.js`, `agent/`, `public/`, `lib/`) è il **daily tracker /
agente AI personale di Marco**. La cartella `flip/` è un prodotto separato (Chiaro) con il
proprio `CLAUDE.md`: non mescolare i due progetti.

## Decisioni prese (non rimetterle in discussione senza chiedere)

- **Uso personale, un solo utente.** Nessun multi-tenant, nessuna gestione account di terzi.
  Il codice multi-utente esistente si può semplificare quando lo si tocca.
- **Visione universale, primo prodotto professionale.** Architettura pensata per vita
  privata + lavoro, ma l'MVP si concentra sull'attività professionale (avvocato/imprenditore).
- **Dispositivi di riferimento:**
  - Telefono: **Honor Magic V6** (Android, MagicOS, pieghevole).
  - Smartwatch: **Google Pixel Watch** (Wear OS).
  - Anello: **RingConn 2**.
- **Nessuna azione esterna senza conferma esplicita** (invio email, eventi in calendario,
  messaggi). L'agente prepara bozze; l'utente approva (anche dal watch).
- **Audio:** solo attivazione manuale, indicatore di registrazione sempre visibile,
  trascrizione e poi cancellazione dell'audio. Fase 2, non nell'MVP.

## Architettura (4 componenti)

1. **Agent App** — centro di comando sul telefono.
2. **Wearable Interface** — Pixel Watch: notifiche, approvazioni rapide, input vocale.
3. **Memory System** — memoria strutturata e ricercabile (Supabase + pgvector).
4. **Proactive Engine** — decide quando intervenire (evoluzione di `agent/morning-agent.js`).

### Memoria: domini separati fin dal giorno 1

`work` / `personal` / `health`, con regole di accesso e conservazione dei dati diverse.
Le regole più stringenti (vedi sotto) valgono per `work`.

## Privacy e compliance (dominio `work`)

- I dati dei clienti sono soggetti a GDPR (l'esenzione per uso domestico NON si applica
  all'attività professionale) e al segreto professionale.
- Dati `work` solo verso provider AI con **DPA e zero data retention**, preferibilmente
  con trattamento in UE (o DPF/SCC se USA). I fallback gratuiti (Gemini free, Groq free)
  NON vanno usati per dati `work`.
- Sul telefono: notifiche e bozze, non archivi locali di email/documenti dei clienti.

## Note tecniche sui dispositivi

- **Pixel Watch:** le notifiche Android (con action button e risposta vocale) vengono
  inoltrate al watch automaticamente → Fase 1 senza codice sul watch. Fase 2: app Wear OS
  nativa (Kotlin/Compose) con Tile e pulsante "Registra". Capacitor non gira su Wear OS.
- **Dati salute:** sorgente unica = **Health Connect** sul telefono (Pixel Watch via
  Fitbit, RingConn se supportato). `RINGCONN_SHORTCUT_SETUP.md` è per iOS ed è superato.
  Scegliere una sorgente primaria per sonno/HR per evitare duplicati (di norma l'anello
  per il sonno).
- **Honor / MagicOS:** gestione batteria aggressiva che chiude le app in background.
  Prevedere nell'onboarding: disattivare ottimizzazione batteria, consentire avvio
  automatico e attività in background per l'app, altrimenti sync e notifiche si perdono.
- **Pieghevole:** layout responsive per schermo esterno (stretto) e interno (quasi tablet).
