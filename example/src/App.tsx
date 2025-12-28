import "./App.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import {
  useUploadFile,
  type UploadMethod,
} from "@gilhrpenner/convex-files-control/react";
import type { StorageProvider } from "@gilhrpenner/convex-files-control";
import { DesktopLayout } from "./components/DesktopLayout";
import { OSWindow } from "./components/OSWindow";
import { ScreenWithDocs } from "./components/ScreenWithDocs";
import { DocumentationPanel } from "./components/DocumentationPanel";
import { RetroButton } from "./components/RetroButton";
import { RetroInput, RetroSelect, RetroCheckbox } from "./components/RetroInput";

function parseTimestamp(input: string): { value: number | null; error?: undefined } | { value?: undefined; error: string } {
  if (!input) {
    return { value: null };
  }
  const date = new Date(input);
  const value = date.getTime();
  if (Number.isNaN(value)) {
    return { error: "Invalid date." };
  }
  return { value };
}

function App() {
  const convexSiteUrl = useMemo(
    () => import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site"),
    [],
  );

  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("presigned");
  const [uploadProvider, setUploadProvider] = useState<StorageProvider>("convex");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [accessKey, setAccessKey] = useState("test_user");
  const [expiresAt, setExpiresAt] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [downloadStorageId, setDownloadStorageId] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [unlimitedUses, setUnlimitedUses] = useState(false);
  const [downloadExpiresAt, setDownloadExpiresAt] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const resolvedAccessKey = accessKey.trim() || "test_user";
  const downloadUrlWithKey = downloadUrl
    ? `${downloadUrl}&testAccessKey=${encodeURIComponent(
        resolvedAccessKey,
      )}`
    : "";

  const { uploadFile } = useUploadFile(api.example, {
    http: { baseUrl: convexSiteUrl },
  });
  const storeCustomFile = useMutation(api.example.storeCustomFile);
  const createDownloadUrl = useMutation(api.example.createDownloadUrl);

  const componentFiles = useQuery(api.example.listComponentFiles, {});
  const customFiles = useQuery(api.example.listCustomFiles, {});
  const downloadGrants = useQuery(api.example.listDownloadGrants, {});

  useEffect(() => {
    if (!downloadStorageId && componentFiles && componentFiles.length > 0) {
      setDownloadStorageId(componentFiles[0].storageId);
    }
  }, [componentFiles, downloadStorageId]);

  const handleUpload = async () => {
    setUploadStatus(null);
    setDownloadStatus(null);
    setDownloadUrl("");
    setIsUploading(true);
    
    if (!selectedFile) {
      setUploadStatus("Select a file to upload.");
      setIsUploading(false);
      return;
    }

    const trimmedAccessKey = accessKey.trim();
    if (!trimmedAccessKey) {
      setUploadStatus("Access key is required.");
      setIsUploading(false);
      return;
    }

    const expiresAtResult = parseTimestamp(expiresAt);
    if (expiresAtResult.error) {
      setUploadStatus(expiresAtResult.error);
      setIsUploading(false);
      return;
    }

    try {
      const uploadResult = await uploadFile({
        file: selectedFile,
        accessKeys: [trimmedAccessKey],
        expiresAt: expiresAtResult.value,
        method: uploadMethod,
        provider: uploadProvider,
      });

      if (!uploadResult.metadata) {
        setUploadStatus("Upload complete, but metadata is unavailable.");
        return;
      }

      await storeCustomFile({
        storageId: uploadResult.storageId,
        fileName: selectedFile.name,
        expiresAt: uploadResult.expiresAt,
        size: uploadResult.metadata.size,
        sha256: uploadResult.metadata.sha256,
        contentType: uploadResult.metadata.contentType,
        accessKey: trimmedAccessKey,
      });

      setUploadStatus("Upload complete.");
    } catch (error) {
      setUploadStatus(
        error instanceof Error ? error.message : "Upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateDownloadUrl = async () => {
    setDownloadStatus(null);
    setDownloadUrl("");

    if (!downloadStorageId) {
      setDownloadStatus("Select a storage ID.");
      return;
    }

    const expiresAtResult = parseTimestamp(downloadExpiresAt);
    if (expiresAtResult.error) {
      setDownloadStatus(expiresAtResult.error);
      return;
    }

    let maxUsesValue: number | null | undefined = undefined;
    if (unlimitedUses) {
      maxUsesValue = null;
    } else {
      const parsed = Number(maxUses);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setDownloadStatus("Max uses must be at least 1.");
        return;
      }
      maxUsesValue = parsed;
    }

    try {
      const result = await createDownloadUrl({
        storageId: downloadStorageId,
        baseUrl: convexSiteUrl,
        maxUses: maxUsesValue,
        expiresAt: expiresAtResult.value,
        filename: downloadFilename.trim() || undefined,
      });
      setDownloadUrl(result.downloadUrl);
      setDownloadStatus("Download URL generated.");
    } catch (error) {
      setDownloadStatus(
        error instanceof Error ? error.message : "Download URL failed.",
      );
    }
  };

  return (
    <DesktopLayout>
      <ScreenWithDocs
        window={
          <OSWindow
            title="File Upload v1.0"
            accentColor="var(--os-accent-primary)"
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div style={{ display: "flex", gap: "16px" }}>
                <RetroCheckbox
                  label="Pre-signed URL"
                  checked={uploadMethod === "presigned"}
                  onChange={() => setUploadMethod("presigned")}
                />
                <RetroCheckbox
                  label="HTTP Action"
                  checked={uploadMethod === "http"}
                  onChange={() => setUploadMethod("http")}
                />
              </div>

              <RetroSelect
                label="STORAGE PROVIDER"
                value={uploadProvider}
                onChange={(event) =>
                  setUploadProvider(event.target.value as StorageProvider)
                }
              >
                <option value="convex">Convex Storage</option>
                <option value="r2">Cloudflare R2</option>
              </RetroSelect>

              <div
                style={{
                  border: "2px dashed var(--os-border)",
                  padding: "20px",
                  textAlign: "center",
                  background: "#f9f9f9",
                }}
              >
                <input
                  type="file"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                  style={{ fontFamily: "var(--font-display)" }}
                />
              </div>

              <RetroInput
                label="ACCESS KEY"
                type="text"
                value={accessKey}
                placeholder="test_user"
                onChange={(event) => setAccessKey(event.target.value)}
              />

              <RetroInput
                label="EXPIRATION"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />

              <RetroButton onClick={handleUpload} disabled={isUploading}>
                {isUploading ? "UPLOADING..." : "INITIATE UPLOAD"}
              </RetroButton>

              {uploadStatus && (
                <div
                  style={{
                    padding: "8px",
                    background: "#eee",
                    border: "2px solid var(--os-border)",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.8rem",
                  }}
                >
                  STATUS: {uploadStatus}
                </div>
              )}
            </div>
          </OSWindow>
        }
        docs={
          <DocumentationPanel title="Upload Methods">
            <p style={{ marginBottom: "12px" }}>
              Choose between two upload strategies:
            </p>
            
            <p style={{ marginBottom: "8px" }}><strong>1. Pre-signed URL</strong> (Recommended)</p>
            <p style={{ marginBottom: "8px" }}>
              The most flexible option with the least restrictions. Requires a 3-step client-side flow:
            </p>
            <ol style={{ paddingLeft: "20px", marginBottom: "16px" }}>
                <li>Request a pre-signed URL.</li>
                <li>Upload file directly to the URL.</li>
                <li>Submit the resulting storage ID to the server for registration.</li>
            </ol>

            <p style={{ marginBottom: "8px" }}><strong>2. HTTP Action</strong></p>
            <p style={{ marginBottom: "16px" }}>
              A direct server upload method. Requires CORS configuration and endpoint mounting. It offers better control by handling files and metadata directly on the server but imposes a 20MB limit per file.
            </p>

            <p style={{ marginBottom: "8px" }}><strong>Configuration</strong></p>
            <ul style={{ paddingLeft: "20px" }}>
                <li><strong>Access Key</strong>: A comma-separated list of identifiers (User ID, Tenant ID) required for future download authorization.</li>
                <li><strong>Expiration</strong>: Optional timestamp. Expired files are automatically purged by a cron job.</li>
            </ul>
          </DocumentationPanel>
        }
      />

      <ScreenWithDocs
        window={
          <OSWindow
            title="My Documents"
            accentColor="var(--os-accent-tertiary)"
          >
            {!customFiles ? (
              <p>Scanning...</p>
            ) : (
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {customFiles.length === 0 && <p>Directory is empty.</p>}
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {customFiles.map((file) => (
                    <li
                      key={file._id}
                      style={{
                        background: "#fff",
                        border: "2px solid var(--os-border)",
                        marginBottom: "8px",
                        padding: "8px",
                        fontFamily: "var(--font-display)",
                        fontSize: "0.8rem",
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>{file.fileName}</div>
                      <div>SIZE: {file.size} bytes</div>
                      <div>TYPE: {file.contentType ?? "unknown"}</div>
                      <div>
                        EXP:{" "}
                        {file.expiresAt === null
                          ? "NEVER"
                          : new Date(Number(file.expiresAt)).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </OSWindow>
        }
        docs={
          <DocumentationPanel title="File Registry">
            <p style={{ marginBottom: "12px" }}>
                Upon successful upload and registration, the component returns file metadata including <strong>SHA-256 checksum</strong>, <strong>file size</strong>, and <strong>MIME type</strong>.
            </p>
            <p>
                <strong>Note:</strong> The base component does not persist this metadata internally. If your application requires this information for display or logic (as shown in this example), you must create a custom table to store it.
            </p>
          </DocumentationPanel>
        }
      />



      <ScreenWithDocs
        window={
          <OSWindow
            title="Download Center"
            accentColor="var(--os-accent-secondary)"
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <RetroSelect
                label="TARGET FILE"
                value={downloadStorageId}
                onChange={(event) => setDownloadStorageId(event.target.value)}
              >
                <option value="">SELECT STORAGE ID</option>
                {componentFiles?.map((file: { storageId: string }) => (
                  <option key={file.storageId} value={file.storageId}>
                    {file.storageId}
                  </option>
                ))}
              </RetroSelect>

              <div
                style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <RetroInput
                    label="MAX USES"
                    type="number"
                    min="1"
                    value={maxUses}
                    disabled={unlimitedUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                  />
                </div>
                <div style={{ paddingBottom: "12px" }}>
                  <RetroCheckbox
                    label="UNLIMITED"
                    checked={unlimitedUses}
                    onChange={(event) => setUnlimitedUses(event.target.checked)}
                  />
                </div>
              </div>

              <RetroInput
                label="TTL"
                type="datetime-local"
                value={downloadExpiresAt}
                onChange={(event) => setDownloadExpiresAt(event.target.value)}
              />

              <RetroInput
                label="CUSTOM FILENAME"
                type="text"
                value={downloadFilename}
                placeholder="report.pdf"
                onChange={(event) => setDownloadFilename(event.target.value)}
              />

              <RetroButton
                variant="secondary"
                onClick={handleGenerateDownloadUrl}
              >
                GENERATE LINK
              </RetroButton>

              {downloadStatus && (
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.8rem",
                  }}
                >
                  {downloadStatus}
                </p>
              )}

              {downloadUrl && (
                <div
                  style={{
                    background: "#fff",
                    border: "2px solid var(--os-border)",
                    padding: "8px",
                    wordBreak: "break-all",
                    fontSize: "0.8rem",
                    fontFamily: "monospace",
                  }}
                >
                  <div style={{ marginBottom: "8px" }}>
                    <strong>LINK:</strong>{" "}
                    <a
                      href={downloadUrl}
                      target="_blank"
                      style={{ color: "blue" }}
                    >
                      OPEN
                    </a>
                  </div>
                  <div>
                    <strong>TEST:</strong>{" "}
                    <a
                      href={downloadUrlWithKey}
                      target="_blank"
                      style={{ color: "blue" }}
                    >
                      OPEN WITH KEY
                    </a>
                  </div>
                </div>
              )}
            </div>
          </OSWindow>
        }
        docs={
          <DocumentationPanel title="Secure Downloads">
            <p style={{ marginBottom: "12px" }}>
                Generate secure, temporary download links by providing a <code>storageId</code>.
            </p>
            
            <p style={{ marginBottom: "8px" }}><strong>Configuration Options:</strong></p>
            <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
                <li><strong>Max Uses</strong>: Default is <code>1</code>. Set to <code>null</code> for unlimited downloads.</li>
                <li><strong>TTL (Time to Live)</strong>: Default is <code>0</code> (no expiration).</li>
                <li><strong>Filename</strong>: Optional. Renames the file upon download.</li>
            </ul>

            <p style={{ marginBottom: "12px" }}>
                <strong>Note on Security:</strong> You do NOT need to provide an access key to generate the link. The component validates the access key internally when the user attempts to consume the link.
            </p>

            <p>
                <strong>Proxy Architecture:</strong> The download is fully proxied through your Convex HTTP action. The underlying storage URL (which has no expiration or access control) is consumed server-side and <strong>never exposed</strong> to the end user.
            </p>
          </DocumentationPanel>
        }
      />

      <ScreenWithDocs
        window={<OSWindow title="Active Grants" accentColor="#a0a0a0">
          {!downloadGrants ? (
            <p>Loading...</p>
          ) : (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {downloadGrants.length === 0 && <p>No active grants.</p>}
              <ul style={{ listStyle: "none", padding: 0 }}>
                {downloadGrants.map(
                  (grant: {
                    _id: string;
                    useCount: number;
                    maxUses: number | null;
                    expiresAt: number | null;
                  }) => {
                    const baseUrl = `${convexSiteUrl}/files/download?token=${encodeURIComponent(
                      grant._id,
                    )}`;
                    return (
                    <li
                      key={grant._id}
                      style={{
                        background: "#eee",
                        border: "2px solid var(--os-border)",
                        marginBottom: "8px",
                        padding: "8px",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      <div style={{ marginBottom: "4px" }}>
                        <strong>ID:</strong> {grant._id.substring(0, 15)}...
                      </div>
                      <div>
                        <strong>USES:</strong> {grant.useCount} /{" "}
                        {grant.maxUses === null ? "∞" : grant.maxUses}
                      </div>
                      <div>
                        <strong>EXP:</strong>{" "}
                        {grant.expiresAt === null
                          ? "NEVER"
                          : new Date(Number(grant.expiresAt)).toLocaleString()}
                      </div>
                      <div
                        style={{
                          marginTop: "8px",
                          wordBreak: "break-all",
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                        }}
                      >
                        <div style={{ marginBottom: "12px" }}>
                          <a
                            href={`${baseUrl}&testAccessKey=${encodeURIComponent(
                              resolvedAccessKey,
                            )}`}
                            target="_blank"
                            style={{ color: "blue" }}
                          >
                            {`${baseUrl}&testAccessKey=${encodeURIComponent(
                              resolvedAccessKey,
                            )}`}
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </OSWindow>}
        docs={
            <DocumentationPanel title="Grant Monitoring">
            <p style={{ marginBottom: "12px" }}>
                Live view of active download grants.
            </p>
            
            <p style={{ marginBottom: "12px" }}>
                <strong>Validation & Lifecycle:</strong>
                Every download attempt is validated against the grant's <code>maxUses</code> and <code>expiresAt</code> limits. 
                If a limit is reached, access is strictly denied. A cron job implemented in your app should purge expired or exhausted grants by calling the cleanup function.
            </p>

            <p style={{ marginBottom: "8px" }}><strong>Development Note:</strong></p>
            <p>
                In this demo, you see a <code>testAccessKey</code> in the URL query parameters. This simulates the access key that would normally be resolved securely from your user's authenticated session (e.g., User ID, Tenant ID) in a production application.
            </p>
          </DocumentationPanel>
        }
      />
      <div style={{ marginTop: "20px" }}>

        
        <DocumentationPanel title="Additional Primitives">
          <p style={{ marginBottom: "16px" }}>
              The <code>convex-files-control</code> component provides additional primitives for granular control that are not shown in this demo:
          </p>

          <h4 style={{ marginBottom: "8px", fontFamily: "var(--font-display)" }}>File Management</h4>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
              <li><code>deleteFile(storageId)</code>: Manually delete a file and its metadata.</li>
              <li><code>updateFileExpiration(storageId, expiresAt)</code>: Specific expiration override.</li>
          </ul>

          <h4 style={{ marginBottom: "8px", fontFamily: "var(--font-display)" }}>Access Control</h4>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
              <li><code>addAccessKey(storageId, accessKey)</code>: Grant specific access to a file.</li>
              <li><code>removeAccessKey(storageId, accessKey)</code>: Revoke access.</li>
              <li><code>hasAccessKey(storageId, accessKey)</code>: Check permission boolean.</li>
              <li><code>listAccessKeysPage(storageId, paginationOpts)</code>: View keys for a file.</li>
          </ul>

          <h4 style={{ marginBottom: "8px", fontFamily: "var(--font-display)" }}>Querying</h4>
          <ul style={{ paddingLeft: "20px" }}>
              <li><code>listFilesPage(paginationOpts)</code>: List files in internal storage.</li>
              <li><code>listFilesByAccessKeyPage(accessKey, paginationOpts)</code>: List files accessible by a specific key.</li>
              <li><code>getFile(storageId)</code>: Fetch metadata for a single file.</li>
          </ul>
        </DocumentationPanel>
      </div>
    </DesktopLayout>
  );
}

export default App;
