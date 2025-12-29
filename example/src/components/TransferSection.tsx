import * as React from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRightLeft, Loader2, RefreshCw } from "lucide-react";
import { DocumentationPanel } from "./DocumentationPanel";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Section demonstrating file transfer capabilities.
 */
export function TransferSection() {
  const uploadsQuery = useQuery(api.files.listUserUploads);
  const uploads = React.useMemo(() => uploadsQuery ?? [], [uploadsQuery]);
  const transferFile = useAction(api.files.transferFile);

  const [selectedFileId, setSelectedFileId] = React.useState<string>("");
  const [targetProvider, setTargetProvider] = React.useState<"convex" | "r2">("r2");
  const [isTransferring, setIsTransferring] = React.useState(false);

  // Automatically select first file if nothing selected
  React.useEffect(() => {
    if (!selectedFileId && uploads.length > 0) {
      setSelectedFileId(uploads[0]._id);
    }
  }, [uploads, selectedFileId]);

  const selectedFile = uploads.find((u) => u._id === selectedFileId);

  const handleTransfer = async () => {
    if (!selectedFileId) return;
    
    setIsTransferring(true);
    try {
      await transferFile({
        _id: selectedFileId as Id<"filesUploads">,
        targetProvider,
      });
      // Optionally show success message
    } catch (error) {
      console.error("Transfer failed", error);
      alert("Transfer failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 mt-12 pt-12 border-t border-white/10">
      <div className="md:col-span-1 space-y-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Transfer Files
          </h2>
          
          <div className="space-y-2">
            <Label>Select File to Transfer</Label>
            <Select 
              value={selectedFileId} 
              onValueChange={setSelectedFileId}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10 hover:bg-white/10">
                <SelectValue placeholder="Select a file" />
              </SelectTrigger>
              <SelectContent>
                {uploads.map((file) => (
                  <SelectItem key={file._id} value={file._id}>
                    {file.fileName} ({file.storageProvider})
                  </SelectItem>
                ))}
                {uploads.length === 0 && (
                  <SelectItem value="none" disabled>No files available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Target Provider</Label>
            <RadioGroup
              value={targetProvider}
              onValueChange={(v) => setTargetProvider(v as "convex" | "r2")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="convex" id="t-convex" disabled={selectedFile?.storageProvider === "convex"} />
                <Label htmlFor="t-convex" className={selectedFile?.storageProvider === "convex" ? "text-muted-foreground" : ""}>Convex Storage</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="r2" id="t-r2" disabled={selectedFile?.storageProvider === "r2"} />
                <Label htmlFor="t-r2" className={selectedFile?.storageProvider === "r2" ? "text-muted-foreground" : ""}>Cloudflare R2</Label>
              </div>
            </RadioGroup>
            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                Current provider: <span className="font-medium text-foreground">{selectedFile.storageProvider === "convex" ? "Convex" : "R2"}</span>
              </p>
            )}
          </div>

          <Button
            className="w-full shadow-lg shadow-primary/20"
            disabled={!selectedFile || isTransferring || selectedFile.storageProvider === targetProvider}
            onClick={() => void handleTransfer()}
          >
            {isTransferring ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="mr-2 h-4 w-4" />
            )}
            Transfer to {targetProvider === "convex" ? "Convex" : "R2"}
          </Button>
        </div>
      </div>

      <div className="md:col-span-2">
        <DocumentationPanel title="About File Transfers">
          <p>
            The <code>transferFile</code> action moves file data between storage providers 
            (Convex to R2, or vice versa) while strictly preserving all access controls and download grants.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Zero Downtime:</strong> Access keys and download tokens remain valid during and after transfer.</li>
            <li><strong>Automatic Cleanup:</strong> The file is deleted from the source provider only after successful transfer.</li>
            <li><strong>Metadata Preservation:</strong> Content type, size, and checksums are verified.</li>
          </ul>
          <div className="mt-4 p-3 rounded bg-black/20 font-mono text-xs">
            <div className="text-muted-foreground">// Example Usage</div>
            <div>await ctx.runAction(components.convexFilesControl.transfer.transferFile, {"{"}</div>
            <div className="pl-4">storageId: file.storageId,</div>
            <div className="pl-4">targetProvider: "r2",</div>
            <div className="pl-4">r2Config: ...</div>
            <div>{"}"});</div>
          </div>
        </DocumentationPanel>
      </div>
    </div>
  );
}
