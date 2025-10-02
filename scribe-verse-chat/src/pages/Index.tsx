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

const Index = () => {
  const { user, loading } = useAuthSession();
  const { toast } = useToast();

  const [version, setVersion] = useState<BotVersion>("V2");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [showTyping, setShowTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    document.title = "AI Chat – Multi-Version Assistant";
  }, []);

  // Redirect to /auth if not logged in
  useEffect(() => {
    if (!loading && !user) window.location.href = "/auth";
  }, [loading, user]);

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [c, chatsRes] = await Promise.all([
          service.getCredits(),
          service.listChats(1000, 0),
        ]);
        setCredits(c);
        setChats(chatsRes);
        if (chatsRes.length === 0) {
          const created = await service.createChat("New Chat");
          setChats([created]);
          setActiveId(asId(created.id));
        } else {
          setActiveId(asId(chatsRes[0].id));
        }
      } catch (e: any) {
        toast({ title: "Load error", description: e?.message ?? String(e) });
      }
    })();
  }, [user]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const msgs = await service.listMessages(activeId, 200, 0);
        const normalized = msgs
          .filter(Boolean)
          .map((m: any) => ({ ...m, role: m.role ?? m.content?.role ?? "assistant" }));
        setMessages(normalized);
        setTimeout(scrollToBottom, 0);
      } catch (e: any) {
        toast({ title: "Messages error", description: e?.message ?? String(e) });
      }
    })();
  }, [activeId]);

  const onNewChat = async () => {
    try {
      const chat = await service.createChat("New Chat");
      setChats((prev) => [chat, ...prev]);
      setActiveId(asId(chat.id));
      setMessages([]);
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
      if (asId(activeId) === asId(id)) {
        const next = chats.find((c) => asId(c.id) !== asId(id));
        if (next) setActiveId(asId(next.id));
        else await onNewChat();
      }
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? String(e) });
    }
  };

  const pushNotice = (text: string) => {
    if (!activeId || !user) return;
    const notice: Message = {
      id: `notice-${Date.now()}`,
      chat_id: activeId,
      user_id: user.id,
      role: "assistant",
      content: { text, version, meta: { notice: true } } as any,
      created_at: new Date().toISOString(),
    } as any;
    setMessages((m) => [...m, notice]);
    setTimeout(scrollToBottom, 25);
  };

  const send = async (text: string) => {
    if (!activeId || sending) return;

    if ((credits?.remaining ?? 0) <= 0) {
      pushNotice("Credits not enough.");
      return;
    }

    setSending(true);
    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      chat_id: activeId,
      user_id: user!.id,
      role: "user",
      content: { text, version, meta: {} } as any,
      created_at: new Date().toISOString(),
    } as any;

    setMessages((m) => [...m, userMsg]);
    setShowTyping(true);

    try {
      const res: any = await service.sendMessage({ chatId: activeId, version, text });

      if (res?.errorCode === "INSUFFICIENT_CREDITS") {
        setMessages((m) => m.filter((mm) => mm && (mm as any).id !== userMsg.id));
        setShowTyping(false);
        pushNotice("Credits not enough.");
        return;
      }

      const { assistant, credits: newCredits } = res;
      // ✅ keep credits in sync without NaN
      if (newCredits) setCredits(newCredits);

      setShowTyping(false);
      setMessages((m) => [...m, { ...assistant, role: "assistant" } as any]);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setShowTyping(false);
      setMessages((m) => m.filter((mm) => mm && (mm as any).id !== userMsg.id));
      toast({ title: "Send failed", description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (lastUserText: string) => {
    if (!activeId || sending) return;

    if ((credits?.remaining ?? 0) <= 0) {
      pushNotice("Credits not enough.");
      return;
    }

    setSending(true);
    setShowTyping(true);
    try {
      const res: any = await service.regenerate({ chatId: activeId, version, lastUserText });

      if (res?.errorCode === "INSUFFICIENT_CREDITS") {
        setShowTyping(false);
        pushNotice("Credits not enough.");
        return;
      }

      const { assistant, credits: newCredits } = res;
      if (newCredits) setCredits(newCredits);

      setShowTyping(false);
      setMessages((m) => [...m, { ...assistant, role: "assistant" } as any]);
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setShowTyping(false);
      toast({ title: "Regenerate failed", description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed" });
    }
  };

  return (
    <SidebarProvider>
      {/* FIX: pin the whole shell to the viewport so the window never scrolls */}
      <div className="fixed inset-0 flex overflow-hidden">
        <AppSidebar
          chats={chats}
          activeId={activeId}
          onSelect={(id) => setActiveId(asId(id))}
          onNewChat={onNewChat}
          onRename={onRename}
          onDelete={onDelete}
          loggedIn={!!user}
        />

        {/* Right side: column layout. Only the middle region scrolls. */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0">
            <ChatHeader
              version={version}
              credits={credits ?? { remaining: 0 }}
              onVersionChange={setVersion}
            />
          </div>

          <section
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 break-words"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10">
                Start your first conversation…
              </div>
            )}

            {messages.filter(Boolean).map((m: any) => (
              <ChatMessageItem
                key={String(m.id)}
                message={{ ...m, role: m.role ?? m.content?.role ?? "assistant" } as any}
                onCopy={onCopy}
                onRegenerate={(t) => regenerate(t)}
              />
            ))}

            {showTyping && <TypingBubble />}
            <div ref={messagesEndRef} />
          </section>

          <div className="shrink-0 bg-background border-t">
            <ChatInput disabled={sending} onSend={send} />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
