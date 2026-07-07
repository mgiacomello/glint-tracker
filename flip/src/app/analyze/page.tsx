import { AnalyzeFlow } from "@/components/analyze/AnalyzeFlow";

export default async function AnalyzePage(props: PageProps<"/analyze">) {
  const { mode } = await props.searchParams;
  const m = mode === "camera" ? "camera" : "upload";
  return <AnalyzeFlow mode={m} />;
}
