# Setup: RingConn 2 → Daily Tracker (via Apple Health)

RingConn 2 non ha API pubblica. Questo Shortcut legge i dati da **Apple Health** (dove RingConn sincronizza automaticamente) e li invia al tracker ogni mattina alle **6:00** — 30 minuti prima del briefing.

---

## Prerequisiti

1. **RingConn 2** sincronizzato con **Apple Health** (attivalo nell'app RingConn: Profilo → Apple Health → attiva tutto)
2. iPhone con **Shortcuts** app
3. Server del Daily Tracker attivo su `http://localhost:3000` (Mac acceso, `npm start` in esecuzione)
4. iPhone e Mac sulla **stessa rete Wi-Fi** — sostituisci `localhost` con l'IP del Mac (es. `192.168.1.100`)

> Per trovare l'IP del Mac: Preferenze di Sistema → Rete → Wi-Fi → vedi l'IP mostrato.

---

## Shortcut — Istruzioni passo per passo

### 1. Crea il Shortcut
Apri l'app **Shortcuts** → tocca **+** in alto a destra.

### 2. Aggiungi azioni (in ordine)

#### Azione 1 — Data di oggi (testo)
- Cerca: **"Date"** → scegli **"Format Date"**
- Date: **"Current Date"**
- Format: **"Custom"** → inserisci: `yyyy-MM-dd`
- Salva il risultato come variabile: `today`

#### Azione 2 — Sonno totale
- Cerca: **"Health"** → scegli **"Find Health Samples"**
- Type: **"Sleep Analysis"**
- Sort: **"Latest First"**
- Limit: **1**

- Aggiungi **"Calculate Statistics"** sul risultato
- Statistic: **"Sum"** → per il campo **"Value"** (ore di sonno)

- Aggiungi **"Set Variable"** → nome: `sleepHours`

#### Azione 3 — HRV
- Cerca: **"Health"** → scegli **"Find Health Samples"**
- Type: **"Heart Rate Variability"**
- Sort: **"Latest First"** · Limit: **1**
- Aggiungi **"Get Details of Health Sample"** → **"Value"**
- Aggiungi **"Set Variable"** → nome: `hrv`

#### Azione 4 — HR a riposo
- Cerca: **"Health"** → scegli **"Find Health Samples"**
- Type: **"Resting Heart Rate"**
- Sort: **"Latest First"** · Limit: **1**
- Aggiungi **"Get Details of Health Sample"** → **"Value"**
- Aggiungi **"Set Variable"** → nome: `restingHR`

#### Azione 5 — SpO2
- Cerca: **"Health"** → scegli **"Find Health Samples"**
- Type: **"Oxygen Saturation"**
- Sort: **"Latest First"** · Limit: **1**
- Aggiungi **"Get Details of Health Sample"** → **"Value"**
- Aggiungi **"Set Variable"** → nome: `spo2`

#### Azione 6 — Calcola Sleep Score
- Aggiungi **"Calculate"** (calcolatrice)
- Operazione: `sleepHours * 10` (punteggio approssimativo: 8h = 80)
- Limita tra 0 e 100 con un **"If"**: se risultato > 100 → 100, else usa valore
- **Set Variable** → nome: `sleepScore`

#### Azione 7 — Costruisci il corpo JSON
- Aggiungi **"Text"** e incolla:

```
{
  "sleepScore": [sleepScore],
  "sleepDuration": "[sleepHours] h",
  "hrv": [hrv],
  "restingHR": [restingHR],
  "spo2": [spo2],
  "stressLevel": "low",
  "source": "apple_health",
  "recordedAt": "[Current Date in ISO format]"
}
```

Sostituisci ogni `[variabile]` con la variabile Shortcuts corrispondente (tocca e inserisci).

#### Azione 8 — Invia al server
- Cerca: **"Get Contents of URL"**
- URL: `http://[IP_DEL_MAC]:3000/api/day/[today]/health`
  - Sostituisci `[IP_DEL_MAC]` con l'IP del tuo Mac (es. `192.168.1.100`)
  - Inserisci la variabile `today` nel path
- Method: **POST**
- Headers: `Content-Type: application/json`
- Body: **JSON** → incolla il testo costruito al passo 7

### 3. Aggiungi automazione
- Vai su **Automation** (tab in basso) → **+** → **"Time of Day"**
- Time: **06:00**
- Frequency: **Daily**
- Run Immediately: **ON** (così non chiede conferma)
- Action: esegui il Shortcut creato

---

## Alternativa semplificata (solo Sleep Score)

Se il Shortcut completo è complesso, puoi usare questa versione minimale che invia solo il sleep score:

1. **Find Health Samples** → Sleep Analysis → ultimi campioni
2. **Get Details** → Duration (in minuti)
3. **Calculate** → minuti / 60 (ore totali)
4. **Text** → `{ "sleepDuration": "[ore] h", "source": "apple_health", "recordedAt": "..." }`
5. **Get Contents of URL** → POST a `http://[IP]:3000/api/day/[today]/health`

---

## Test manuale

Per testare che funzioni, puoi lanciare questo comando dal Mac (sostituisci la data):

```bash
curl -X POST http://localhost:3000/api/day/2026-03-14/health \
  -H "Content-Type: application/json" \
  -d '{
    "sleepScore": 78,
    "sleepDuration": "7h 12m",
    "sleepStart": "23:15",
    "sleepEnd": "06:27",
    "hrv": 52,
    "restingHR": 58,
    "spo2": 97,
    "stressLevel": "low",
    "source": "test",
    "recordedAt": "2026-03-14T06:00:00"
  }'
```

Poi apri `http://localhost:3000` → tab Crescita → vedrai la card **🛌 Sonno & Benessere**.

---

## Dati supportati

| Campo | Fonte Apple Health | Descrizione |
|-------|-------------------|-------------|
| `sleepScore` | Sleep Analysis (calcolato) | Qualità sonno 0–100 |
| `sleepDuration` | Sleep Analysis | Ore totali di sonno |
| `sleepStart` / `sleepEnd` | Sleep Analysis | Orario inizio/fine |
| `deepSleep` | Sleep Analysis (Deep) | Ore di sonno profondo |
| `remSleep` | Sleep Analysis (REM) | Ore di sonno REM |
| `hrv` | Heart Rate Variability | Variabilità frequenza cardiaca (ms) |
| `restingHR` | Resting Heart Rate | FC a riposo (bpm) |
| `spo2` | Oxygen Saturation | Saturazione ossigeno (%) |
| `stressLevel` | — | `"low"` / `"medium"` / `"high"` (da HRV) |
| `readiness` | — | Prontezza giornaliera 0–100 |

---

## Come appare nel Tracker

Una volta configurato, ogni mattina nella tab **Crescita** vedrai:

```
🛌 Sonno & Benessere · RingConn 2         registrato alle 06:00
[78]   😊 Buono
       Stress: 🟢 Basso              🌙 23:15 → 06:27

  7h 12m   1h 45m   1h 20m   52 ms   58 bpm   97%
  Sonno    Deep     REM      HRV     HR rip.  SpO₂

————————————————————————————————————
🏃  In forma — ottimo per nuoto, palestra o corsa
🥗  Alimentazione normale, mantieni idratazione
🧠  Giornata ottimale per decisioni importanti
```
