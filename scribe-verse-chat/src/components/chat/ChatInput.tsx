import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Paperclip } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export default function ChatInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [filesCount, setFilesCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-expand textarea up to a max height, then scroll internally
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 240; // px
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!disabled && value.trim()) {
          onSend(value.trim());
          setValue("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, value, onSend]);

  return (
    <TooltipProvider>
      <div className="border-t p-3 bg-background space-y-2">
        {/* Attachments preview */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, idx) => {
              const isImage = file.type.startsWith("image/");
              const url = isImage ? URL.createObjectURL(file) : "";
              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <div className="relative border rounded-md p-2 bg-card text-card-foreground">
                      {isImage ? (
                        <img src={url} alt={file.name} className="h-16 w-16 object-cover rounded" />
                      ) : (
                        <span className="text-xs max-w-[160px] truncate block">{file.name}</span>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => {
                              setFiles((prev) => prev.filter((_, i) => i !== idx));
                              setFilesCount((c) => Math.max(0, c - 1));
                            }}
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">{file.name}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Composer row */}
        <div className="flex gap-2 items-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Attach files"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Attach files</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => {
              const list = Array.from(e.currentTarget.files ?? []);
              if (list.length) {
                setFiles((prev) => [...prev, ...list]);
                setFilesCount((c) => c + list.length);
              }
              // reset to allow re-selecting the same file(s)
              e.currentTarget.value = "";
            }}
            className="hidden"
            aria-hidden="true"
          />
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your message..."
            className="w-full min-w-0 min-h-[60px] max-h-60 resize-none overflow-y-auto"
            aria-label="Message input"
            disabled={disabled}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  if (!disabled && value.trim()) {
                    onSend(value.trim());
                    setValue("");
                    setFiles([]);
                    setFilesCount(0);
                  }
                }}
                disabled={disabled || !value.trim()}
                aria-label="Send"
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Send (⌘/Ctrl+Enter)</TooltipContent>
          </Tooltip>
        </div>

        <div className="pt-1 text-center text-xs text-muted-foreground">Chatbot can make mistakes. Check important info.</div>

      </div>
    </TooltipProvider>
  );
}
