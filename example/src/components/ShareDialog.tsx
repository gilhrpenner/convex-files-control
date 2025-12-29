import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Loader2, Share2, Check, RefreshCw } from "lucide-react";
import { ExpirationDateInput } from "@/components/ExpirationDateInput";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

interface ShareDialogProps {
  fileId: Id<"filesUploads">;
  fileName: string;
}

export function ShareDialog({ fileId, fileName }: ShareDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Form state
  const [isPublic, setIsPublic] = React.useState(true);
  const [maxUses, setMaxUses] = React.useState("1");
  const [password, setPassword] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);

  const createShareableLink = useMutation(api.files.createShareableLink);

  const handleGenerateValues = async () => {
    setLoading(true);
    setGeneratedUrl(null);
    try {
      const result = await createShareableLink({
        _id: fileId,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresAt: expiresAt?.getTime() ?? undefined,
        password: password || undefined,
        public: isPublic,
      });

      // Construct the download URL - points to frontend download page
      // The download page will handle password prompts if needed
      const url = `${window.location.origin}/download?token=${result.downloadToken}`;
      setGeneratedUrl(url);
    } catch (error) {
      console.error("Failed to generate link:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedUrl) {
      void navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setGeneratedUrl(null);
    setIsPublic(true);
    setMaxUses("1");
    setPassword("");
    setExpiresAt(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-background text-foreground border-white/10">
        <DialogHeader>
          <DialogTitle>Share "{fileName}"</DialogTitle>
          <DialogDescription>
            Generate a shareable link for this file.
          </DialogDescription>
        </DialogHeader>

        {!generatedUrl ? (
          <div className="grid gap-6 py-4">
            {/* Public Toggle */}
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="public-mode" className="flex flex-col space-y-1">
                <span>Public Link</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Anyone with the link can download
                </span>
              </Label>
              <Switch
                id="public-mode"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {/* Max Uses */}
            <div className="grid gap-2">
              <Label htmlFor="max-uses">Max Uses</Label>
              <Input
                id="max-uses"
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited if empty"
                className="bg-white/5 border-white/10"
              />
            </div>

            {/* Expiration */}
            <div className="grid gap-2">
              <Label>Expiration</Label>
              <ExpirationDateInput onDateChange={setExpiresAt} />
            </div>

            {/* Password */}
            <div className="grid gap-2">
              <Label htmlFor="password">Password (Optional)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Require a password to download"
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-4">
            <div className="flex items-center space-x-2">
              <Input
                value={generatedUrl}
                readOnly
                className="bg-white/5 border-white/10 font-mono text-sm"
              />
              <Button
                size="icon"
                variant="outline"
                className="shrink-0 border-white/10 hover:bg-white/5"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground">
              <p>This link will work until the max uses are reached or it expires.</p>
              {!isPublic && <p className="mt-1 text-yellow-500">Note: Since "Public Link" was off, users must be logged in to use this link.</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {!generatedUrl ? (
            <Button onClick={() => void handleGenerateValues()} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Link
            </Button>
          ) : (
             <Button variant="ghost" onClick={reset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Generate New
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
