import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function StickyHeader() {
  const users = useQuery(api.users.listUsers);
  const currentUser = useQuery(api.users.currentUser);
  const { signIn } = useAuthActions();

  // Track local selection for optimistic UI (overrides server state temporarily)
  const [localSelection, setLocalSelection] = useState<string | null>(null);

  const handleUserSwitch = async (userId: string) => {
    setLocalSelection(userId); // Optimistic update
    try {
      await signIn("demo-impersonate", { userId: userId as Id<"users"> });
      // Reset subscriptions and cached data when changing the demo identity.
      window.location.reload();
    } catch (error) {
      setLocalSelection(null);
      toast.error("Sign in failed", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  const isLoading = users === undefined || currentUser === undefined;

  // Use local selection if set, otherwise use server state
  // Reset local selection when it matches server (server caught up)
  const serverUserId = currentUser?._id ?? null;
  const displayValue =
    localSelection !== null && localSelection !== serverUserId
      ? localSelection
      : (serverUserId ?? "");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/50 backdrop-blur-md">
      <div className="container mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Shared demo · Users and files are public. Upload test data only.
        </p>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Select
            value={displayValue}
            onValueChange={(v) => void handleUserSwitch(v)}
          >
            <SelectTrigger
              aria-label="Demo user"
              className="w-[200px] bg-white/5 border-white/10 hover:bg-white/10 font-semibold cursor-pointer"
            >
              <SelectValue placeholder="Select User" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  {user.name ?? user.email ?? "Anonymous"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </header>
  );
}
