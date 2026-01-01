import * as React from "react";
import { StickyHeader } from "@/components/StickyHeader";
import { TransferSection } from "@/components/TransferSection";
import { AccessControlSection } from "@/components/AccessControlSection";
import { AdminDashboard } from "@/components/AdminDashboard";
import { ShareDialog } from "@/components/ShareDialog";
import { FileDropzone, type FileItem } from "@/components/FileDropzone";
import { ExpirationDateInput } from "@/components/ExpirationDateInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Upload, Loader2, FileIcon, Cloud, HardDrive, Trash, Download } from "lucide-react";
import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
import type { StorageProvider } from "@gilhrpenner/convex-files-control";
import { api } from "../convex/_generated/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

/** Demo limits */
const DEMO_MAX_FILE_SIZE_MB = 5;

function App() {
  const [files, setFiles] = React.useState<FileItem[]>([]);
  const [provider, setProvider] = React.useState<StorageProvider>("convex");
  const [method, setMethod] = React.useState<"presigned" | "http">("presigned");
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [virtualPath, setVirtualPath] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);

  const authToken = useAuthToken();
  const userUploads = useQuery(
    api.files.listUserUploads,
    authToken ? {} : "skip",
  );
  const deleteFile = useMutation(api.files.deleteFile);
  const getFileDownloadUrl = useMutation(api.files.getFileDownloadUrl);

  const convexSiteUrl = React.useMemo(
    () => (import.meta.env.VITE_CONVEX_URL || "https://intent-tiger-143.convex.cloud").replace(".cloud", ".site"),
    [],
  );

  const { uploadFile } = useUploadFile(api.files, {
    http: {
      baseUrl: convexSiteUrl,
      authToken: authToken ?? undefined,
    },
  });

  const fileCount = files.length;
  const uploadLabel = isUploading
    ? "Uploading..."
    : fileCount > 1
      ? "Upload files"
      : "Upload file";

  const resolveVirtualPath = React.useCallback(
    (fileName: string) => {
      const trimmed = virtualPath.trim();
      if (!trimmed) return undefined;
      if (files.length > 1 || trimmed.endsWith("/")) {
        return `${trimmed.replace(/\/+$/g, "")}/${fileName}`;
      }
      return trimmed;
    },
    [files.length, virtualPath],
  );

  const handleUpload = async () => {
    if (files.length === 0) return;

    // Demo limit: Check file sizes before upload
    const oversizedFiles = files.filter(
      (f) => f.file.size > DEMO_MAX_FILE_SIZE_MB * 1024 * 1024
    );
    if (oversizedFiles.length > 0) {
      toast.error(
        `File size exceeds ${DEMO_MAX_FILE_SIZE_MB}MB limit: ${oversizedFiles.map((f) => f.file.name).join(", ")}`
      );
      return;
    }

    setIsUploading(true);

    try {
      for (const fileItem of files) {
        // Create a new File object with the user's custom name
        const fileWithCustomName = new File(
          [fileItem.file],
          fileItem.name,
          { type: fileItem.file.type }
        );
        const resolvedVirtualPath = resolveVirtualPath(fileWithCustomName.name);
        
        await uploadFile({
          file: fileWithCustomName,
          expiresAt: expiresAt?.getTime() ?? null,
          method,
          provider,
          virtualPath: resolvedVirtualPath,
        });
      }
      setFiles([]);
      
      // Demo info toast
      toast.success("Upload successful!", {
        description:
          "Demo note: Files expire in 24 hours and are limited to 5MB. In your own app, you have full control over these limits. HTTP Actions have a 20MB maximum.",
        duration: 8000,
      });
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // @ts-expect-error - we know the id is correct string
      await deleteFile({ _id: id });
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      // @ts-expect-error - we know the id is correct string
      const { downloadUrl, fileName } = await getFileDownloadUrl({ _id: id });
      
      // Fetch the file in the background
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }
      const blob = await response.blob();
      
      // Create blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
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
              <h2 className="text-xl font-semibold tracking-tight">
                Upload Documents
              </h2>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Select a storage provider
                </label>
                <Select
                  value={provider}
                  onValueChange={(v) => setProvider(v as StorageProvider)}
                >
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
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as "presigned" | "http")}
                >
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
              <div className="space-y-2">
                <Label htmlFor="virtual-path">Virtual path (optional)</Label>
                <Input
                  id="virtual-path"
                  placeholder="/tenant/123/uploads/ or /tenant/123/report.pdf"
                  value={virtualPath}
                  onChange={(e) => setVirtualPath(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
                <p className="text-xs text-muted-foreground">
                  If you upload multiple files, this is treated as a folder and the file name is appended.
                </p>
              </div>

              <Button
                className="w-full py-6 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={fileCount === 0 || isUploading || !authToken}
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
            <div className="h-full rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold tracking-tight mb-6">
                Your Uploads
              </h2>

              {!authToken ? (
                <Empty className="border border-dashed border-white/10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileIcon className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>Sign in to view uploads</EmptyTitle>
                    <EmptyDescription>
                      Please sign in to see your uploaded files.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : userUploads === undefined ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : userUploads.length === 0 ? (
                <Empty className="border border-dashed border-white/10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileIcon className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>No files uploaded yet</EmptyTitle>
                    <EmptyDescription>
                      Upload your first file using the form on the left.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  {userUploads.some((u) => u.expiresAt != null && u.expiresAt < Date.now()) && (
                    <div className="mb-4 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 text-sm text-yellow-200">
                      <strong>Note:</strong> Expired files are automatically cleaned up by a scheduled cron job.
                      See the <a href="https://github.com/gilhrpenner/convex-files-control#cleanup" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-100">documentation</a> for details on configuring cleanup intervals.
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                    <TableRow>
                      <TableHead>File name</TableHead>
                      <TableHead>Virtual path</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userUploads.map((upload) => (
                      <TableRow key={upload._id}>
                        <TableCell className="font-medium">
                          {upload.fileName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {upload.virtualPath ?? "-"}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {upload.storageProvider === "convex" ? (
                              <HardDrive className="h-4 w-4" />
                            ) : (
                              <Cloud className="h-4 w-4" />
                            )}
                            {upload.storageProvider === "convex"
                              ? "Convex"
                              : "R2"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {upload.metadata?.size
                            ? `${(upload.metadata.size / 1024).toFixed(1)} KB`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {upload.expiresAt
                            ? upload.expiresAt < Date.now()
                              ? <span className="text-destructive font-medium">Expired</span>
                              : new Date(upload.expiresAt).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const isExpired = upload.expiresAt != null && upload.expiresAt < Date.now();
                            return (
                              <div className="flex items-center gap-1">
                                <ShareDialog
                                  fileId={upload._id}
                                  fileName={upload.fileName}
                                  disabled={isExpired}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => void handleDownload(upload._id)}
                                  disabled={isExpired}
                                  title={isExpired ? "File has expired" : "Download"}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => void handleDelete(upload._id)}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </>
              )}
            </div>
          </div>
        </div>


        <TransferSection />
        <AccessControlSection />
        <AdminDashboard />
      </main>
    </div>
  );
}

export default App;
