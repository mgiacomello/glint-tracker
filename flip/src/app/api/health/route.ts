import { hasAIEnv } from "@/lib/ai";

export const runtime = "nodejs";

/** Public: tells the client whether real AI analysis is available (key set) or demo mode. */
export function GET() {
  return Response.json({ ai: hasAIEnv });
}
