import * as React from "react";
import { StickyHeader } from "@/components/StickyHeader";
import { FileDropzone, type FileItem } from "@/components/FileDropzone";
import { ExpirationDateInput } from "@/components/ExpirationDateInput";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2 } from "lucide-react";
import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
import type { StorageProvider } from "@gilhrpenner/convex-files-control";
import { api } from "../convex/_generated/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

function App() {
  const [files, setFiles] = React.useState<FileItem[]>([]);
  const [provider, setProvider] = React.useState<StorageProvider>("convex");
  const [method, setMethod] = React.useState<"presigned" | "http">("presigned");
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const convexSiteUrl = React.useMemo(
    () => import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site"),
    [],
  );

  const { uploadFile } = useUploadFile(api.files, {
    http: { baseUrl: convexSiteUrl },
  });

  const fileCount = files.length;
  const uploadLabel = isUploading 
    ? "Uploading..." 
    : fileCount > 1 
      ? "Upload files" 
      : "Upload file";

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      for (const fileItem of files) {
        await uploadFile({
          file: fileItem.file,
          expiresAt: expiresAt?.getTime() ?? null,
          method,
          provider,
        });
      }
      setFiles([]);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <StickyHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Left Column (1/3) */}
          <div className="md:col-span-1 space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Upload Documents</h2>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Select a storage provider
                </label>
                <Select value={provider} onValueChange={(v) => setProvider(v as StorageProvider)}>
                  <SelectTrigger className="w-full bg-white/5 border-white/10 hover:bg-white/10">
                    <SelectValue placeholder="Select a storage provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="convex">Convex</SelectItem>
                    <SelectItem value="r2">Cloudflare R2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Upload Method</Label>
                <RadioGroup value={method} onValueChange={(v) => setMethod(v as "presigned" | "http")}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="presigned" id="presigned" />
                    <Label htmlFor="presigned">Pre-signed URL</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="http" id="http" />
                    <Label htmlFor="http">HTTP Action</Label>
                  </div>
                </RadioGroup>
              </div>

              <FileDropzone files={files} onFilesUpdated={setFiles} />
            </section>

            <section className="space-y-6">
              <ExpirationDateInput onDateChange={setExpiresAt} />
              
              <Button 
                className="w-full py-6 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={fileCount === 0 || isUploading}
                onClick={() => void handleUpload()}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                {uploadLabel}
              </Button>
            </section>
          </div>

          {/* Right Column (2/3) */}
          <div className="md:col-span-2">
             {/* Placeholder for future content */}
            <div className="h-full rounded-xl border border-white/10 bg-white/5 p-8">
               <div className="flex h-full items-center justify-center text-muted-foreground">
                  Right Column Content
               </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
