import { HomeView } from "@/components/home/HomeView";
import { getCurrentUser } from "@/lib/auth";
import { peopleFooledLastHour } from "@/lib/stories";

export default async function HomePage() {
  const user = await getCurrentUser();

  return <HomeView user={user} fooledCount={peopleFooledLastHour()} />;
}
