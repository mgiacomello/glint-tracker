import { DocumentScreen } from "@/components/document/DocumentScreen";

export default async function DocumentPage(props: PageProps<"/document/[id]">) {
  const { id } = await props.params;
  return <DocumentScreen id={id} />;
}
