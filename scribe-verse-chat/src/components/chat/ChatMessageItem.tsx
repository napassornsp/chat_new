import { ClipboardCopy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Message } from "@/services/types";

interface Props {
  message: Message;
  onCopy: (text: string) => void;
  onRegenerate: (userText: string) => void;
}

export default function ChatMessageItem({ message, onCopy, onRegenerate }: Props) {
  const isAssistant = message.role === "assistant";
  const text = (message.content as any)?.text ?? "";
  const version = (message.content as any)?.version as "V1" | "V2" | "V3";

  return (
    <div className={`w-full flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] min-w-0 rounded-lg border p-3 bg-card text-card-foreground shadow-sm ${isAssistant ? "" : "bg-secondary"} break-words overflow-x-hidden [overflow-wrap:anywhere]`}>
        {isAssistant && (
          <div className="mb-1">
            <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/20">From {version}</Badge>
          </div>
        )}
        <div className="min-w-0 whitespace-pre-wrap break-words [word-break:break-word] [overflow-wrap:anywhere] text-sm leading-6 overflow-x-hidden [&_img]:max-w-full [&_img]:h-auto [&_video]:max-w-full [&_video]:h-auto">{text}</div>
        <div className="mt-2 flex gap-2 opacity-80">
          <Button variant="ghost" size="sm" aria-label="Copy message" onClick={() => onCopy(text)}>
            <ClipboardCopy className="h-4 w-4" />
            <span className="sr-only">Copy</span>
          </Button>
          {isAssistant && (
            <Button variant="ghost" size="sm" aria-label="Regenerate" onClick={() => onRegenerate(text)}>
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Regenerate</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
