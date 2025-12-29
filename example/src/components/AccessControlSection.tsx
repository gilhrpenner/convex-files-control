import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Plus, Trash2, Clock } from "lucide-react";
import { DocumentationPanel } from "./DocumentationPanel";
import { Id } from "../../convex/_generated/dataModel";
import { ExpirationDateInput } from "./ExpirationDateInput";

export function AccessControlSection() {
  const allUploads = useQuery(api.files.listUserUploads, {}) ?? [];
  // Filter out expired files to prevent errors when trying to update them
  const uploads = allUploads.filter(
    (u) => u.expiresAt == null || u.expiresAt > Date.now()
  );
  const [selectedFileId, setSelectedFileId] = React.useState<string>("");
  const [newAccessKey, setNewAccessKey] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const addKey = useMutation(api.files.addAccessKey);
  const removeKey = useMutation(api.files.removeAccessKey);
  const updateExpiration = useMutation(api.files.updateFileExpiration);

  // Automatically select first file
  React.useEffect(() => {
    if (!selectedFileId && uploads.length > 0) {
      setSelectedFileId(uploads[0]._id);
    }
  }, [uploads, selectedFileId]);

  const selectedFile = uploads.find((u) => u._id === selectedFileId);
  
  // Fetch access keys for selected file
  const accessKeys = useQuery(
    api.files.listAccessKeys, 
    selectedFileId ? { _id: selectedFileId as Id<"filesUploads"> } : "skip"
  );

  const handleAddKey = async () => {
    if (!selectedFileId || !newAccessKey) return;
    setIsSubmitting(true);
    try {
      await addKey({ 
        _id: selectedFileId as Id<"filesUploads">, 
        accessKey: newAccessKey 
      });
      setNewAccessKey("");
    } catch (error) {
      console.error(error);
      alert("Failed to add key: " + String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveKey = async (key: string) => {
    if (!selectedFileId) return;
    if (!confirm(`Revoke access for key "${key}"?`)) return;
    try {
      await removeKey({ 
        _id: selectedFileId as Id<"filesUploads">, 
        accessKey: key 
      });
    } catch (error) {
      console.error(error);
      alert("Failed to remove key: " + String(error));
    }
  };

  const handleUpdateExpiration = async (date: Date | null) => {
    if (!selectedFileId) return;
    try {
      await updateExpiration({
        _id: selectedFileId as Id<"filesUploads">,
        expiresAt: date ? date.getTime() : null,
      });
    } catch (error) {
      console.error(error);
      alert("Failed to update expiration: " + String(error));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 mt-12 pt-12 border-t border-white/10">
      <div className="md:col-span-1 space-y-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Access Control
          </h2>
          
          <div className="space-y-2">
            <Label>Manage Access For</Label>
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
                    {file.fileName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedFile && (
            <div className="space-y-6 pt-2">
              <div className="space-y-3">
                <Label>Add Access Key</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="User ID, Email, or Tenant ID" 
                    value={newAccessKey}
                    onChange={(e) => setNewAccessKey(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                  <Button 
                    size="icon" 
                    disabled={!newAccessKey || isSubmitting}
                    onClick={() => void handleAddKey()}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Current Access Keys</Label>
                  <span className="text-xs text-muted-foreground">{accessKeys?.length ?? 0} active</span>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-2 space-y-2 max-h-[150px] overflow-y-auto">
                  {!accessKeys ? (
                    <div className="p-2 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto opacity-50" /></div>
                  ) : accessKeys.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-2">No keys found</div>
                  ) : (
                    accessKeys.map((key) => (
                      <div key={key} className="flex items-center justify-between text-sm p-2 rounded hover:bg-white/5 group">
                        <span className="font-mono text-xs truncate max-w-[180px]" title={key}>{key}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleRemoveKey(key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label>Update Expiration</Label>
                </div>
                <ExpirationDateInput 
                  initialDate={selectedFile.expiresAt ? new Date(selectedFile.expiresAt) : null}
                  onDateChange={(date) => void handleUpdateExpiration(date)} 
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="md:col-span-2">
        <DocumentationPanel title="Granular Access Control">
          <p>
            The <code>accessControl</code> module manages who can access your files. 
            Files are not inherently public; they require a valid access key or a download grant.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
             <div>
               <h4 className="text-foreground font-medium mb-1">Access Keys</h4>
               <p className="text-xs">
                 Strings attached to a file record. A user must present a matching key 
                 (e.g., their User ID) to download the file directly via the file's storage ID. 
                 Multiple keys allow sharing across users or tenants.
               </p>
             </div>
             <div>
               <h4 className="text-foreground font-medium mb-1">Expiration</h4>
               <p className="text-xs">
                 Files can be scheduled for auto-deletion. Adding an expiration date
                 updates the internal <code>expiresAt</code> field. The background cron job
                 permanently deletes expired files.
               </p>
             </div>
          </div>
        </DocumentationPanel>
      </div>
    </div>
  );
}
