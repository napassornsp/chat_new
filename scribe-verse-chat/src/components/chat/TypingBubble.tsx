export default function TypingBubble() {
  return (
    <div className="w-full flex justify-start">
      <div className="max-w-[70%] rounded-lg border p-3 bg-muted text-muted-foreground">
        <span className="inline-flex gap-1 items-end" aria-live="polite" aria-label="Assistant is typing">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.3s]"></span>
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.15s]"></span>
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce"></span>
        </span>
      </div>
    </div>
  );
}
