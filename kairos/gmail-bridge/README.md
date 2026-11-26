# Kair.OS — collegamento a Gmail (10 minuti, una volta sola)

Lo script gira **dentro il tuo account Google** (Apps Script). Legge le email di prenotazione
e carta d'imbarco e pubblica **solo** i dati dei voli: numero, data, orari, aeroporti, posto,
gruppo, orario d'imbarco e chiusura gate, terminal, classe e PNR. Il testo delle email non esce mai.

Formati verificati su email reali: British Airways (e-ticket receipt), ITA Airways (boarding pass),
Ryanair (itinerario), Wizz Air (itinerario). Altri (Booking, eDreams, easyJet...) sono gestiti con
regole generiche: vanno verificati alla prima scansione.

## Setup
1. Vai su https://script.google.com → **Nuovo progetto** → chiamalo `Kair.OS bridge`.
2. Incolla il contenuto di `Code.gs` al posto del codice di esempio. Salva.
3. Dal menu funzioni scegli `setup` → **Esegui** → autorizza l'accesso a Gmail (lettura).
   Nel **Log di esecuzione** trovi `TOKEN = ...`: copialo.
4. **Esegui il deployment → Nuovo deployment → Tipo: App web**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque** (l'accesso è protetto dal token)
   Copia l'URL `https://script.google.com/macros/s/.../exec`.
5. Nel file `kairos/local.properties` aggiungi:
   ```
   GMAIL_BRIDGE_URL=https://script.google.com/macros/s/XXXX/exec?token=IL_TUO_TOKEN
   ```
6. Ricompila e installa le app. La scansione gira ogni ora; dall'app (icona busta) puoi forzarla.

Se usi più indirizzi (es. Gmail personale + dominio), inoltra le conferme di volo all'account
dove gira lo script, oppure installa lo script anche sull'altro account (un URL per account).

## Note privacy / rischi
- Lo scope Gmail resta tra te e Google: nessuna app di terzi riceve l'accesso alla casella.
- L'URL con token dà accesso ai tuoi dati di volo (incluso PNR). Trattalo come una password;
  per revocarlo: rigenera `TOKEN` (cancella la proprietà e riesegui `setup`) o archivia il deployment.
- Se un giorno l'app diventa pubblica, serve un vero OAuth per utente: lo scope Gmail è "restricted"
  e richiede verifica Google + assessment di sicurezza (CASA).
