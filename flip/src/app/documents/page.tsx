import { DocumentsList } from "@/components/document/DocumentsList";
import { getCurrentUser } from "@/lib/auth";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  return <DocumentsList user={user} />;
}
