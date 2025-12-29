import * as React from "react";
import { useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ChevronLeft, ChevronRight, Database, FileText, Key, Loader2, Lock } from "lucide-react";
import { DocumentationPanel } from "./DocumentationPanel";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = React.useState("files");
  
  return (
    <div className="mt-12 pt-12 border-t border-white/10 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          System Administration
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-white/5 border border-white/10">
                <TabsTrigger value="files" className="data-[state=active]:bg-white/10">
                  <FileText className="h-4 w-4 mr-2" />
                  All Files
                </TabsTrigger>
                <TabsTrigger value="grants" className="data-[state=active]:bg-white/10">
                  <Key className="h-4 w-4 mr-2" />
                  Download Grants
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 min-h-[400px] rounded-xl border border-white/10 bg-white/5 p-4 overflow-hidden relative">
              <TabsContent value="files" className="mt-0 h-full">
                <FilesTable />
              </TabsContent>
              <TabsContent value="grants" className="mt-0 h-full">
                <GrantsTable />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <DocumentationPanel title="Admin Capabilities">
            <div className="space-y-4">
              <p>
                The component provides powerful query capabilities for admin interfaces.
                These queries support cursor-based pagination to handle large datasets efficiently.
              </p>
              
              <div>
                <h4 className="text-foreground font-medium mb-1 flex items-center gap-2">
                  <FileText className="h-3 w-3" /> File Registry
                </h4>
                <p className="text-xs">
                  The <code>files</code> table acts as the central registry, mapping storage IDs 
                  to metadata and provider info. It is the source of truth for file existence.
                </p>
              </div>

              <div>
                <h4 className="text-foreground font-medium mb-1 flex items-center gap-2">
                  <Key className="h-3 w-3" /> Download Grants
                </h4>
                <p className="text-xs">
                  Grants are temporary tokens allowing file access. They can track usage
                  (<code>maxUses</code>), enforce expiration, and require passwords.
                  Shareable links are simply download grants with specific configurations.
                </p>
              </div>
            </div>
          </DocumentationPanel>
        </div>
      </div>
    </div>
  );
}

function FilesTable() {
  const authToken = useAuthToken();
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);
  
  const results = useQuery(
    api.files.listAllFiles,
    authToken
      ? {
          paginationOpts: {
            numItems: 8,
            cursor: cursor,
          },
        }
      : "skip"
  );

  const handleNext = () => {
    if (results?.continueCursor) {
      setHistory((prev) => [...prev, cursor!]); // Using ! for null is safe since initial is handled
      setCursor(results.continueCursor);
    }
  };

  const handlePrev = () => {
    const prevCursor = history[history.length - 1] ?? null;
    setHistory((prev) => prev.slice(0, -1));
    setCursor(prevCursor);
  };

  if (!authToken) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lock className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>Sign in required</EmptyTitle>
            <EmptyDescription>
              Please sign in to view all files in the system.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!results) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead>Storage ID</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.page.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No files found.
                </TableCell>
              </TableRow>
            ) : (
              results.page.map((file) => (
                <TableRow key={file.storageId} className="hover:bg-white/5 border-white/10">
                  <TableCell className="font-mono text-xs">{file.storageId.slice(0, 8)}...</TableCell>
                  <TableCell className="text-xs">{file.storageProvider}</TableCell>
                  <TableCell>
                    {file.expiresAt ? (
                      <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-500">Expiring</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-500">Permanent</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pt-4 mt-auto border-t border-white/10">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handlePrev} 
          disabled={history.length === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {results.page.length} items
        </span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleNext} 
          disabled={results.isDone}
        >
           Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function GrantsTable() {
  const authToken = useAuthToken();
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);
  
  const results = useQuery(
    api.files.listDownloadGrants,
    authToken
      ? {
          paginationOpts: {
            numItems: 8,
            cursor: cursor,
          },
        }
      : "skip"
  );

  const handleNext = () => {
    if (results?.continueCursor) {
      setHistory((prev) => [...prev, cursor!]);
      setCursor(results.continueCursor);
    }
  };

  const handlePrev = () => {
    const prevCursor = history[history.length - 1] ?? null;
    setHistory((prev) => prev.slice(0, -1));
    setCursor(prevCursor);
  };

  if (!authToken) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lock className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>Sign in required</EmptyTitle>
            <EmptyDescription>
              Please sign in to view download grants.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!results) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead>Token</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Expiry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.page.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No grants active.
                </TableCell>
              </TableRow>
            ) : (
              results.page.map((grant) => (
                <TableRow key={grant._id} className="hover:bg-white/5 border-white/10">
                  <TableCell className="font-mono text-xs">{grant._id.slice(0, 12)}...</TableCell>
                  <TableCell>
                    {grant.hasPassword ? (
                      <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-500">Protected</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Standard</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {grant.maxUses === null ? "∞" : grant.maxUses} remaining
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {grant.expiresAt ? new Date(grant.expiresAt).toLocaleDateString() : "Never"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pt-4 mt-auto border-t border-white/10">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handlePrev} 
          disabled={history.length === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {results.page.length} items
        </span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleNext} 
          disabled={results.isDone}
        >
           Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
