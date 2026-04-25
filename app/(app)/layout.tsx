import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUser } from "@/lib/db/queries";
import { TopBar } from "@/components/top-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  const user = await getUser(session.userId).catch(() => null);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        userName={user?.name ?? session.userId}
        userId={session.userId}
        accent={user?.accent_color ?? null}
      />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
