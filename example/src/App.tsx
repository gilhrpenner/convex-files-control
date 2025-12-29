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
import { Upload, Loader2, FileIcon, Cloud, HardDrive, Trash } from "lucide-react";
import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
import type { StorageProvider } from "@gilhrpenner/convex-files-control";
import { api } from "../convex/_generated/api";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

function App() {
  const [files, setFiles] = React.useState<FileItem[]>([]);
  const [provider, setProvider] = React.useState<StorageProvider>("convex");
  const [method, setMethod] = React.useState<"presigned" | "http">("presigned");
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const authToken = useAuthToken();
  const userUploads = useQuery(
    api.files.listUserUploads,
    authToken ? {} : "skip",
  );
  const deleteFile = useMutation(api.files.deleteFile);

  const convexSiteUrl = React.useMemo(
    () => import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site"),
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

  const handleDelete = async (id: string) => {
    try {
      // @ts-expect-error - we know the id is correct string
      await deleteFile({ _id: id });
    } catch (error) {
      console.error("Delete failed:", error);
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userUploads.map((upload) => (
                      <TableRow key={upload._id}>
                        <TableCell className="font-medium">
                          {upload.fileName}
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
                            ? new Date(upload.expiresAt).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => void handleDelete(upload._id)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
