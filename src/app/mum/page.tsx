import { getCircle, getMembers } from "@/lib/circle";
import { MumScreen } from "@/components/mum-screen";

export const dynamic = "force-dynamic";

export default async function MumPage() {
  const circle = await getCircle();
  const mum = (await getMembers(circle.id)).find((m) => m.role === "care_recipient");
  return <MumScreen memberId={mum?.id ?? null} name={circle.careRecipientName} />;
}
