"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import {
  User,
  SlidersHorizontal,
  Gauge,
  FileText,
  Bell,
  Workflow,
  Calendar as CalendarIcon,
  BrainCircuit,
  Plug,
  Activity,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const INLINE_SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "usage", label: "Usage", icon: Gauge },
] as const;

const LINK_SECTIONS = [
  { id: "documents", label: "Documents", icon: FileText, href: "/documents" },
  { id: "reminders", label: "Reminders", icon: Bell, href: "/reminders" },
  { id: "automations", label: "Automations", icon: Workflow, href: "/automations" },
  { id: "calendar", label: "Calendar", icon: CalendarIcon, href: "/calendar" },
  { id: "memory", label: "Memory", icon: BrainCircuit, href: "/memory" },
  { id: "integrations", label: "Integrations", icon: Plug, href: "/integrations" },
  { id: "activity", label: "Activity", icon: Activity, href: "/activity" },
] as const;

type InlineSectionId = (typeof INLINE_SECTIONS)[number]["id"];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [active, setActive] = useState<InlineSectionId>("account");

  function openLink(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[32rem] max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] flex-row gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
          {INLINE_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                active === section.id && "bg-accent font-medium",
              )}
            >
              <section.icon className="size-4" />
              {section.label}
            </button>
          ))}
          <div className="my-1 border-t" />
          {LINK_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openLink(section.href)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <section.icon className="size-4" />
              {section.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-4">
          {active === "account" && <AccountSection />}
          {active === "general" && <GeneralSection />}
          {active === "usage" && <UsageSection />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountSection() {
  return <UserProfile routing="hash" />;
}

function GeneralSection() {
  const [model, setModel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/model")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: { model: string }) => {
        if (!cancelled) setModel(body.model);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-sm text-muted-foreground">Light, dark, or match your system.</p>
        </div>
        <ThemeToggle />
      </div>
      <div>
        <p className="text-sm font-medium">Current model</p>
        <p className="text-sm text-muted-foreground">{failed ? "Unavailable" : (model ?? "Loading...")}</p>
      </div>
    </div>
  );
}

function UsageSection() {
  return (
    <div>
      <p className="text-sm font-medium">Usage</p>
      <p className="mt-1 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
