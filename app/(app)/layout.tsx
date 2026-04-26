import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUser } from "@/lib/db/queries";
import { HiFiShell } from "@/components/hifi";
import { getLang } from "@/lib/i18n/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  const [user, lang] = await Promise.all([
    getUser(session.userId).catch(() => null),
    getLang(),
  ]);
  const accent = user?.accent_color === "teal" ? "teal" : "coral";

  // HiFiShell sets data-design="hifi" + data-accent + data-lang on the
  // wrapper so all warm-paper tokens activate site-wide. Each page renders
  // its own AppBar at the top of its content; the bottom TabBar is owned
  // by the shell.
  return (
    <HiFiShell accent={accent} lang={lang}>
      {children}
    </HiFiShell>
  );
}
