import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { BotVersion, Credits } from "@/services/types";

interface ChatHeaderProps {
  version: BotVersion;
  credits: Credits | null; // expects { remaining: number }
  onVersionChange: (v: BotVersion) => void;
}

export function ChatHeader({ version, credits, onVersionChange }: ChatHeaderProps) {
  const remaining = credits?.remaining ?? 0;
  return (
    <header className="h-14 border-b flex items-center px-3 gap-3 bg-background">
      <h1 className="text-base font-medium flex items-center gap-2">
        <span>Chatbot Version</span>
        <Select value={version} onValueChange={(v) => onVersionChange(v as BotVersion)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="V1">V1</SelectItem>
            <SelectItem value="V2">V2</SelectItem>
            <SelectItem value="V3">V3</SelectItem>
          </SelectContent>
        </Select>
      </h1>
      <div className="ml-auto">
        <Badge variant="secondary" aria-live="polite">Credits: {remaining}</Badge>
      </div>
    </header>
  );
}