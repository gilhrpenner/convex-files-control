import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Lock, AlertCircle } from "lucide-react";
import { useAuthToken } from "@convex-dev/auth/react";

export function DownloadPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const filename = searchParams.get("filename") ?? "download";
  
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [hasAttempted, setHasAttempted] = React.useState(false);

  // Get auth token to include in download request
  const authToken = useAuthToken();

  const convexSiteUrl = React.useMemo(
    () => (import.meta.env.VITE_CONVEX_URL || "https://intent-tiger-143.convex.cloud").replace(".cloud", ".site"),
    [],
  );

  const attemptDownload = React.useCallback(async (passwordToUse?: string) => {
    if (!token) {
      setError("Invalid download link");
      return;
    }

    setLoading(true);
    setError(null);
    setHasAttempted(true);

    try {
      const params = new URLSearchParams({ token, filename });
      if (passwordToUse) {
        params.set("password", passwordToUse);
      }

      // Build headers - include auth token if available
      const headers: HeadersInit = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${convexSiteUrl}/files/download?${params}`, {
        headers,
        credentials: "include", // Include cookies for auth
      });
      
      if (response.ok) {
        // Success - trigger download
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setError(null);
      } else {
        const data = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          // Password required
          setNeedsPassword(true);
          if (passwordToUse) {
            setError("Incorrect password");
          }
        } else if (response.status === 403) {
          setError("Access denied - you may need to sign in first");
        } else if (response.status === 410) {
          setError("This link has expired or been used too many times");
        } else {
          setError(data.error || "Download failed");
        }
      }
    } catch {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  }, [token, filename, convexSiteUrl, authToken]);

  // Try to download on mount, but wait a moment for auth to settle
  // For public links this will work immediately; for non-public links
  // the auth token needs to be available
  React.useEffect(() => {
    if (token && !needsPassword && !hasAttempted) {
      // Small delay to let auth initialize
      const timer = setTimeout(() => {
        void attemptDownload();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [token, needsPassword, hasAttempted, attemptDownload]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void attemptDownload(password);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Invalid Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This download link is invalid or malformed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {needsPassword ? (
              <>
                <Lock className="h-5 w-5" />
                Password Required
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Preparing Download...
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-5 w-5 text-destructive" />
                Download Error
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download Ready
              </>
            )}
          </CardTitle>
          {needsPassword && (
            <CardDescription>
              This file is password protected. Enter the password to download.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {needsPassword ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  disabled={loading}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !password}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Download
              </Button>
            </form>
          ) : error ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => void attemptDownload()} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">Your download should start automatically...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
