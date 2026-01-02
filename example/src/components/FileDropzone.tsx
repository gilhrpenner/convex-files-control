import * as React from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, Trash2, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileDropzoneProps {
  files?: FileItem[];
  onFilesUpdated?: (files: FileItem[]) => void;
  className?: string;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
}

export function FileDropzone({ files: externalFiles, onFilesUpdated, className }: FileDropzoneProps) {
  const [internalFiles, setInternalFiles] = React.useState<FileItem[]>([]);
  
  // Use external files if provided (controlled mode), otherwise use internal state
  const files = externalFiles ?? internalFiles;
  
  const updateFiles = (newFiles: FileItem[]) => {
    if (externalFiles === undefined) {
      setInternalFiles(newFiles);
    }
    onFilesUpdated?.(newFiles);
  };

  const onDrop = (acceptedFiles: File[]) => {
    const newItems = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
    }));
    updateFiles([...files, ...newItems]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 15 * 1024 * 1024, // 15MB
  });

  const handleNameChange = (id: string, newName: string) => {
    const updated = files.map((item) => (item.id === id ? { ...item, name: newName } : item));
    updateFiles(updated);
  };

  const removeFile = (id: string) => {
    const updated = files.filter((item) => item.id !== id);
    updateFiles(updated);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-white/10",
          isDragActive && "border-primary bg-primary/10",
          className
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background mb-4 shadow-sm">
          <UploadCloud className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-muted-foreground">
            SVG, PNG, JPG or GIF (max 5MB)
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md bg-white/5 p-2 ring-1 ring-white/10"
            >
               <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-background/50">
                <FileIcon className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0 grid gap-1">
                 <Input 
                    value={item.name}
                    onChange={(e) => handleNameChange(item.id, e.target.value)}
                    className="h-7 text-sm bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 focus:bg-background focus:border-primary px-1 transition-colors"
                 />
                 <p className="text-xs text-muted-foreground px-1">{formatSize(item.file.size)}</p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeFile(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
