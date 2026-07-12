"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export function AccountMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isLoaded || !user) return null;

  const name = user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "Account";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={user.imageUrl} alt={name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-medium">{name}</span>
              {email && <span className="text-xs text-muted-foreground">{email}</span>}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            {email && <span className="text-xs font-normal text-muted-foreground">{email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/sign-in" })}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
