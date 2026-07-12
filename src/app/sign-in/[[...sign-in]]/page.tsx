import { SignIn } from "@clerk/nextjs";
import { Bot } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/30 p-8">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <span className="font-semibold">Kairo-PA</span>
      </div>
      <SignIn />
    </div>
  );
}
