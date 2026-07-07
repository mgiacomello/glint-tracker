import { getAI, hasAIEnv, MODEL } from "@/lib/ai";
import { extractContent } from "@/lib/analysis/extract";
import { SYSTEM_PROMPT, REALTIME_HINT } from "@/lib/analysis/prompt";
import { mockAnalysisJSONL } from "@/lib/analysis/mock";
import { langInstruction } from "@/lib/i18n";
import { profileInstruction } from "@/lib/profile";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const mode = String(form.get("mode") ?? "upload");
  const lang = langInstruction(form.get("lang") ? String(form.get("lang")) : null);
  const profile = profileInstruction(form.get("profile") ? String(form.get("profile")) : null);

  if (files.length === 0) {
    return new Response("Nessun file ricevuto", { status: 400 });
  }

  // Demo mode: stream a realistic mock so the whole flow works without a key.
  if (!hasAIEnv) {
    return streamMock(files[0].name);
  }

  const multi = files.length > 1;
  let docText = "";
  try {
    for (let i = 0; i < files.length; i++) {
      const ex = await extractContent(files[i]);
      docText += (multi ? `\n\n— Pagina ${i + 1} di ${files.length} —\n` : "") + ex.text;
    }
  } catch {
    return new Response("Impossibile leggere il file", { status: 422 });
  }

  const label = multi ? `documento in ${files.length} pagine` : files[0].name;
  const userText =
    (mode === "eyes" ? REALTIME_HINT + "\n\n" : "") +
    (multi ? "Le pagine seguenti fanno parte di UN SOLO documento: analizzalo nel suo insieme.\n\n" : "") +
    `Ecco il testo del documento "${label}":\n\n"""\n${docText.slice(0, 60_000)}\n"""\n\n` +
    `Analizzalo e produci l'output JSONL richiesto. Scrivi TUTTI i testi dell'analisi in ${lang}.` +
    profile;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const completion = await getAI().chat.completions.create({
          model: MODEL,
          stream: true,
          max_tokens: 4000,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userText },
          ],
        });
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(enc.encode(delta));
        }
        controller.close();
      } catch (err) {
        const message = friendlyError(err);
        controller.enqueue(enc.encode("\n" + JSON.stringify({ type: "error", message }) + "\n"));
        controller.close();
        console.error("analyze error", err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Turns an API error into a simple, clear message for the user. */
function friendlyError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  switch (status) {
    case 401:
    case 403:
      return "La chiave dell'AI non è valida. Controlla GROQ_API_KEY nelle impostazioni del server.";
    case 400:
      return "Il documento non è stato accettato. Prova con un file più piccolo o una foto più chiara.";
    case 429:
      return "Troppe richieste in questo momento (limite gratuito Groq). Riprova tra un minuto.";
    case 500:
    case 502:
    case 503:
      return "Il servizio AI è momentaneamente occupato. Riprova tra poco.";
    default:
      return "Non riesco ad analizzare il documento adesso. Riprova tra poco.";
  }
}

function streamMock(fileName: string) {
  const enc = new TextEncoder();
  const lines = mockAnalysisJSONL(fileName);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of lines) {
        controller.enqueue(enc.encode(line + "\n"));
        await new Promise((r) => setTimeout(r, 450));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
