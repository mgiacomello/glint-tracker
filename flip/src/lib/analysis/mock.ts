/** Realistic demo analysis (mirrors the Chiaro result screens) used when no API key is set. */
export function mockAnalysisJSONL(fileName: string): string[] {
  const events = [
    {
      type: "meta",
      title: "Lettera di incarico professionale",
      summary:
        "Lettera di incarico per la registrazione del marchio denominativo 'BeeGeneSys' come marchio dell'Unione Europea in cinque classi di Nizza. L'incarico include la ricerca di anteriorità e il deposito della domanda.",
      overallRisk: "warn",
      complexity: 64,
      headline:
        "Prima di firmare controlla due cose: il totale di 2.550€ copre solo l'avvio, e i costi in caso di opposizione non sono inclusi.",
      transcript:
        "Questo è un incarico a uno studio per registrare il tuo marchio 'BeeGeneSys' in Europa. In pratica lo studio farà due cose: prima controlla che il nome sia libero, poi deposita la domanda. Il costo per queste fasi iniziali è di 1.200 euro di onorari più 1.350 euro di tasse, quindi 2.550 euro in totale. È un documento normale, ma tieni a mente che questo prezzo copre solo l'avvio: se ci saranno opposizioni o altre fasi, potrebbero arrivare costi aggiuntivi. Leggi bene la parte sui costi prima di firmare.",
    },
    {
      type: "point",
      order: 1,
      title: "Oggetto e Costo Iniziale",
      teaser: "Saprai esattamente cosa copre l'incarico e quanto ti costa inizialmente.",
      whatHappens:
        "Lo studio ti assisterà per la ricerca di anteriorità e il deposito della domanda di registrazione del marchio 'BeeGeneSys' in Europa. Il costo totale per queste due fasi è di 1.200 euro di onorari più 1.350 euro di tasse EUIPO, per un totale di 2.550 euro.",
      isNormal: "Sì, è normale che una lettera di incarico specifichi l'oggetto e i costi per le fasi iniziali.",
      keepInMind: "Questo è il costo per le attività iniziali di ricerca e deposito.",
      canDo: "Chiedi allo studio un preventivo scritto che indichi cosa è incluso nei 2.550€ e cosa no, così eviti sorprese.",
      risk: "safe",
    },
    {
      type: "point",
      order: 2,
      title: "Costi successivi non inclusi",
      teaser: "Capirai quali spese potrebbero arrivare dopo la fase iniziale.",
      whatHappens:
        "L'incarico copre ricerca e deposito. Eventuali opposizioni di terzi, rinnovi o estensioni ad altri Paesi sono attività separate con onorari aggiuntivi non indicati nel preventivo.",
      isNormal: "Sì, è comune separare le fasi, ma è importante che tu sappia che il totale finale può crescere.",
      keepInMind: "Chiedi una stima dei costi in caso di opposizione prima di firmare.",
      canDo: "Prima di firmare, fai mettere per iscritto una stima dei costi extra (opposizioni, rinnovi) o un tetto massimo di spesa.",
      risk: "warn",
    },
    {
      type: "point",
      order: 3,
      title: "Tempi e durata della protezione",
      teaser: "Saprai quanto dura la registrazione e quando va rinnovata.",
      whatHappens:
        "Una volta registrato, il marchio UE dura 10 anni ed è rinnovabile. La procedura di registrazione richiede in genere alcuni mesi se non ci sono opposizioni.",
      isNormal: "Sì, 10 anni rinnovabili è lo standard per i marchi dell'Unione Europea.",
      keepInMind: "Segna la scadenza del rinnovo per non perdere la protezione.",
      canDo: "Aggiungi la scadenza del rinnovo al calendario ora, con un promemoria qualche mese prima, così non rischi di perdere il marchio.",
      risk: "safe",
    },
    {
      type: "deadline",
      title: "Pagamento onorari e tasse di deposito",
      date: null,
      amount: "2.550 €",
      rawText: "1.200 euro di onorari più 1.350 euro di tasse EUIPO",
    },
    {
      type: "deadline",
      title: "Rinnovo marchio UE (ogni 10 anni)",
      date: null,
      amount: null,
      rawText: "Il marchio dell'Unione Europea dura 10 anni ed è rinnovabile",
    },
    { type: "done" },
  ];

  void fileName;
  return events.map((e) => JSON.stringify(e));
}
