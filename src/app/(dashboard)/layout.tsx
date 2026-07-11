import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat" },
  { href: "/documents", label: "Documents" },
  { href: "/reminders", label: "Reminders" },
  { href: "/automations", label: "Automations" },
  { href: "/calendar", label: "Calendar" },
  { href: "/memory", label: "Memory" },
  { href: "/integrations", label: "Integrations" },
  { href: "/activity", label: "Activity" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <nav className="flex gap-4 text-sm overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
