// src/pages/Index.tsx
import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import ChatMessageItem from "@/components/chat/ChatMessageItem";
import ChatInput from "@/components/chat/ChatInput";
import TypingBubble from "@/components/chat/TypingBubble";
import { useToast } from "@/hooks/use-toast";
import useAuthSession from "@/hooks/useAuthSession";
import service from "@/services/backend";
import type { BotVersion, Chat, Credits, Message } from "@/services/types";

const asId = (v: string | number | null | undefined) => String(v ?? "");

export default function Index() {
  const { user, loading } = useAuthSession();
  const { toast } = useToast();

  const [version, setVersion] = useState<BotVersion>("V2");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [showTyping, setShowTyping] = useState(false);

  /** The ONLY scroll container — we scroll this, not the window */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /** Race guards so old loads can't overwrite the new chat */
  const loadSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    document.title = "AI Chat – Multi-Version Assistant";
  }, []);

  // Redirect to /auth if not logged in
  useEffect(() => {
    if (!loading && !user) window.location.href = "/auth";
  }, [loading, user]);

  /** Centralized credits refresh so ChatHeader + guards stay in sync */
  const refreshCredits = async () => {
    try {
      const c = await service.getCredits();
      setCredits(c);
    } catch {
      setCredits({ remaining: 0 });
    }
  };

  // Refresh credits when the tab regains focus
  useEffect(() => {
    const onFocus = () => refreshCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Initial credits + chats
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [c, list] = await Promise.all([service.getCredits(), service.listChats(1000, 0)]);
        setCredits(c);
        setChats(list);
        if (list.length === 0) {
          const created = await service.createChat("New Chat");
          setChats([created]);
          setActiveId(asId(created.id));
          setMessages([]); // clean
        } else {
          setActiveId(asId(list[0].id));
        }
      } catch (e: any) {
        toast({ title: "Load error", description: e?.message ?? String(e) });
      }
    })();
  }, [user]);

  /** Central helper: switch to a chat and show a blank pane instantly */
  const switchChat = (id: string) => {
    // cancel any in-flight message load and invalidate pending results
    abortRef.current?.abort();
    ++loadSeq.current;

    setActiveId(asId(id));
    setMessages([]); // immediate blank state
    setShowTyping(false);
  };

  // Load messages for the active chat — cancel previous, ignore stale, and filter by chat_id
  useEffect(() => {
    if (!activeId) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const seq = ++loadSeq.current;
    setMessages([]); // ensure UI looks clean while loading

    (async () => {
      try {
        const rows: Message[] = await service.listMessages(activeId, 200, 0, {
          signal: abortRef.current?.signal,
        });

        if (seq !== loadSeq.current) return; // stale response → ignore

        const normalized = (rows ?? [])
          .filter(Boolean)
          .filter((m: any) => asId(m.chat_id) === asId(activeId)) // belt & suspenders
          .map((m: any) => ({ ...m, role: m.role ?? m.content?.role ?? "assistant" }));

        setMessages(normalized);
        setTimeout(scrollToBottom, 0);
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.name === "CanceledError") return;
        if (seq !== loadSeq.current) return;
        toast({ title: "Messages error", description: e?.message ?? String(e) });
      }
    })();

    return () => abortRef.current?.abort();
  }, [activeId]);

  const onNewChat = async () => {
    try {
      // clear NOW and cancel any loaders so nothing can pop back
      switchChat(asId("pending-new"));
      const chat = await service.createChat("New Chat");
      setChats((prev) => [chat, ...prev]);
      switchChat(asId(chat.id)); // select the real new chat id (keeps pane clean)
    } catch (e: any) {
      toast({ title: "Could not create chat", description: e?.message ?? String(e) });
    }
  };

  const onRename = async (id: string, title: string) => {
    try {
      await service.renameChat(id, title);
      setChats((cs) => cs.map((c) => (asId(c.id) === asId(id) ? { ...c, title } : c)));
    } catch (e: any) {
      toast({ title: "Rename failed", description: e?.message ?? String(e) });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await service.deleteChat(id);
      setChats((cs) => cs.filter((c) => asId(c.id) !== asId(id)));
      if (asId(activeIdRef.current) === asId(id)) {
        const next = chats.find((c) => asId(c.id) !== asId(id));
        if (next) switchChat(asId(next.id));
        else await onNewChat();
      }
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? String(e) });
    }
  };

  const pushNotice = (text: string) => {
    const id = activeIdRef.current;
    if (!id || !user) return;
    const notice: Message = {
      id: `notice-${Date.now()}`,
      chat_id: id,
      user_id: user.id,
      role: "assistant",
      content: { text, version, meta: { notice: true } } as any,
      created_at: new Date().toISOString(),
    } as any;
    setMessages((m) => [...m, notice]);
    setTimeout(scrollToBottom, 25);
  };

  const send = async (text: string) => {
    const id = activeIdRef.current;
    if (!id || sending) return;

    if ((credits?.remaining ?? 0) <= 0) {
      // Sync with backend once more before blocking
      await refreshCredits();
      if ((credits?.remaining ?? 0) <= 0) {
        pushNotice("Credits not enough.");
        return;
      }
    }

    setSending(true);
    const tmp: Message = {
      id: `tmp-${Date.now()}`,
      chat_id: id,
      user_id: user!.id,
      role: "user",
      content: { text, version, meta: {} } as any,
      created_at: new Date().toISOString(),
    } as any;

    setMessages((m) => [...m, tmp]);
    setShowTyping(true);

    try {
      const res: any = await service.sendMessage({ chatId: id, version, text });

      if (res?.errorCode === "INSUFFICIENT_CREDITS") {
        setShowTyping(false);
        setMessages((m) => m.filter((x) => (x as any).id !== tmp.id));
        await refreshCredits();
        pushNotice("Credits not enough.");
        return;
      }

      const { assistant, credits: newCredits } = res || {};
      if (newCredits) setCredits(newCredits);
      else await refreshCredits();

      // If user switched chats while sending, don't append here
      if (activeIdRef.current !== id) return;

      if (assistant?.chat_id && asId(assistant.chat_id) === asId(id)) {
        setMessages((m) => [...m, { ...assistant, role: "assistant" } as any]);
      }
      setShowTyping(false);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setShowTyping(false);
      setMessages((m) => m.filter((x) => (x as any).id !== tmp.id));
      toast({ title: "Send failed", description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (lastUserText: string) => {
    const id = activeIdRef.current;
    if (!id || sending) return;

    if ((credits?.remaining ?? 0) <= 0) {
      await refreshCredits();
      if ((credits?.remaining ?? 0) <= 0) {
        pushNotice("Credits not enough.");
        return;
      }
    }

    setSending(true);
    setShowTyping(true);
    try {
      const res: any = await service.regenerate({ chatId: id, version, lastUserText });

      if (res?.errorCode === "INSUFFICIENT_CREDITS") {
        setShowTyping(false);
        await refreshCredits();
        pushNotice("Credits not enough.");
        return;
      }

      const { assistant, credits: newCredits } = res || {};
      if (newCredits) setCredits(newCredits);
      else await refreshCredits();

      if (activeIdRef.current !== id) return;

      if (assistant?.chat_id && asId(assistant.chat_id) === asId(id)) {
        setMessages((m) => [...m, { ...assistant, role: "assistant" } as any]);
      }
      setShowTyping(false);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setShowTyping(false);
      toast({ title: "Regenerate failed", description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <SidebarProvider>
      {/* Page pinned to viewport; window cannot scroll (see index.css) */}
      <div className="fixed inset-0 flex overflow-hidden">
        <AppSidebar
          chats={chats}
          activeId={activeId}
          onSelect={(id) => switchChat(asId(id))}
          onNewChat={onNewChat}
          onRename={onRename}
          onDelete={onDelete}
          loggedIn={!!user}
        />

        {/* Right pane: header | scrollable messages | footer */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {/* Header (doesn't scroll) */}
          <div className="shrink-0">
            <ChatHeader
              version={version}
              credits={credits ?? { remaining: 0 }}
              onVersionChange={setVersion}
            />
          </div>

          {/* ONLY this section scrolls */}
          <section
            key={activeId ?? "none"} // force remount on chat switch
            ref={scrollerRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 break-words"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10">
                Start your first conversation…
              </div>
            )}

            {messages.map((m: any) => (
              <ChatMessageItem
                key={String(m.id)}
                message={{ ...m, role: m.role ?? m.content?.role ?? "assistant" } as any}
                onCopy={async (text) => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast({ title: "Copied" });
                  } catch {
                    toast({ title: "Copy failed" });
                  }
                }}
                onRegenerate={(t) => regenerate(t)}
              />
            ))}

            {showTyping && <TypingBubble />}
          </section>

          {/* Composer (doesn't scroll) */}
          <div className="shrink-0 bg-background border-t">
            <ChatInput disabled={sending} onSend={send} />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
