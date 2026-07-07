import { getAI, hasAIEnv, MODEL } from "@/lib/ai";
import type { DocumentAnalysis } from "@/lib/analysis/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface CompareResult {
  summary: string;
  recommendation: "a" | "b" | "none";
  recommendationReason: string;
  differences: { topic: string; a: string; b: string }[];
}

export async function POST(request: Request) {
  const { a, b } = (await request.json()) as { a: DocumentAnalysis; b: DocumentAnalysis };
  if (!a || !b) return new Response("Servono due documenti", { status: 400 });

  if (!hasAIEnv) {
    return Response.json(mockCompare(a, b));
  }

  const prompt = `Confronta questi due documenti per una persona NON esperta e dille quale conviene, in italiano semplice.

DOCUMENTO A — "${a.title}"
${a.summary}
Punti: ${a.points.map((p) => `${p.title}: ${p.whatHappens}`).join(" | ")}

DOCUMENTO B — "${b.title}"
${b.summary}
Punti: ${b.points.map((p) => `${p.title}: ${p.whatHappens}`).join(" | ")}

Rispondi SOLO con un JSON valido (niente markdown) con questa forma:
{"summary":"<2-3 frasi di confronto>","recommendation":"a|b|none","recommendationReason":"<perché, semplice>","differences":[{"topic":"<aspetto>","a":"<com'è in A>","b":"<com'è in B>"}]}`;

  try {
    const res = await getAI().chat.completions.create({
      model: MODEL,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    return Response.json(JSON.parse(text) as CompareResult);
  } catch (err) {
    console.error("compare error", err);
    return new Response("Confronto non riuscito", { status: 500 });
  }
}

function mockCompare(a: DocumentAnalysis, b: DocumentAnalysis): CompareResult {
  return {
    summary: `Entrambi i documenti sono simili, ma "${a.title}" risulta leggermente più chiaro sui costi rispetto a "${b.title}".`,
    recommendation: "a",
    recommendationReason:
      "Il primo documento specifica meglio cosa è incluso e cosa no, riducendo il rischio di sorprese.",
    differences: [
      { topic: "Chiarezza sui costi", a: "Costi e fasi ben separati", b: "Costi indicati ma meno dettagliati" },
      { topic: "Impegni a lungo termine", a: "Nessun rinnovo automatico evidente", b: "Possibile rinnovo da verificare" },
      { topic: "Livello di rischio", a: a.headline, b: b.headline },
    ],
  };
}
