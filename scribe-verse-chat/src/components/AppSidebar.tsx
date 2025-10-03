import { useMemo, useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarFooter,
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Plus,
  MessageSquare,
  FileText,
  Eye,
  User,
  PanelLeft,
  PanelLeftOpen,
  HelpCircle,
  Bell,
  Home,
  LogIn,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import service from "@/services/backend";
import type { Chat } from "@/services/types";
import useAuthSession from "@/hooks/useAuthSession";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";

interface AppSidebarProps {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  loggedIn?: boolean;
}

type OcrItem = {
  id: string;
  type: "bill" | "bank";
  filename: string | null;
  created_at: string;
  approved?: boolean;
  file_url?: string | null;
};

export function AppSidebar({
  chats,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  loggedIn,
}: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuthSession();
  const location = useLocation();
  const isOcr = location.pathname.startsWith("/ocr");

  const [ocrItems, setOcrItems] = useState<OcrItem[]>([]);

  // ---- OCR history loader (guarded + safe) ----
  const loadOcr = async () => {
    try {
      const [{ data: bills }, { data: banks }] = await Promise.all([
        supabase
          .from("ocr_bill_extractions")
          .select("id, filename, created_at, approved, file_url")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ocr_bank_extractions")
          .select("id, filename, created_at, approved, file_url")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const billItems: OcrItem[] = (bills ?? []).map((b: any) => ({
        id: String(b.id),
        type: "bill",
        filename: b.filename ?? null,
        created_at: b.created_at,
        approved: !!b.approved,
        file_url: b.file_url ?? null,
      }));

      const bankItems: OcrItem[] = (banks ?? []).map((b: any) => ({
        id: String(b.id),
        type: "bank",
        filename: b.filename ?? null,
        created_at: b.created_at,
        approved: !!b.approved,
        file_url: b.file_url ?? null,
      }));

      const combined = [...billItems, ...bankItems]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

      setOcrItems(combined);
    } catch {
      // swallow errors so the sidebar doesn't crash if OCR endpoints fail
      setOcrItems([]);
    }
  };

  useEffect(() => {
    if (!isOcr) return;
    loadOcr();
    const listener = () => loadOcr();
    // @ts-ignore custom event
    window.addEventListener("ocr:refresh", listener as any);
    return () => {
      // @ts-ignore custom event
      window.removeEventListener("ocr:refresh", listener as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOcr]);

  // ---- Group chats for sections ----
  const groups = useMemo(() => {
    const now = new Date();
    const getAgeDays = (iso: string) => {
      const d = new Date(iso);
      return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    };

    const recent: Chat[] = [];
    const last7: Chat[] = [];
    const last30: Chat[] = [];
    const older: Chat[] = [];

    for (const c of chats) {
      const days = getAgeDays(c.created_at);
      if (days <= 1) recent.push(c);
      else if (days <= 7) last7.push(c);
      else if (days <= 30) last30.push(c);
      else older.push(c);
    }

    return { recent, last7, last30, older };
  }, [chats]);

  // Helper to ensure stable key and safe id usage
  const chatKey = (c: Chat, index: number) => String(c.id ?? `${c.title ?? "untitled"}-${index}`);
  const chatIdStr = (id: string | number | null | undefined) => String(id ?? "");

  return (
    <Sidebar collapsible="icon" className="h-screen overflow-hidden z-[3]">
      <SidebarContent className="overflow-hidden">
        <SidebarHeader>
          <div className="flex items-center justify-between px-2 py-2">
            {/* Logo area */}
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
                  {/* Expanded: squared chip with your image */}
                  <img
                    src="/jv_logo.jpg"
                    alt="JV System logo"
                    className="h-6 w-6 object-contain"
                  />
                </div>
                <span className="font-semibold text-sm">JV System</span>
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center overflow-hidden">
                {/* Collapsed: circular chip with your image (white-on-primary look) */}
                <img
                  src="/jv_logo.jpg"
                  alt="JV System logo"
                  className="h-6 w-6 object-contain"
                />
              </div>
            )}

            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Expand sidebar"
                    onClick={toggleSidebar}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Collapse sidebar"
                    onClick={toggleSidebar}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse</TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Modules</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="menu-chatbot">
                <SidebarMenuButton
                  tooltip={{ children: "Chatbot", hidden: false }}
                  size="default"
                  className="overflow-hidden"
                  onClick={() => {
                    if (location.pathname !== "/") window.location.href = "/";
                  }}
                >
                  <MessageSquare />
                  {!collapsed && <span>Chatbot</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem key="menu-ocr">
                <SidebarMenuButton
                  tooltip={{ children: "OCR", hidden: false }}
                  className="overflow-hidden"
                  onClick={() => {
                    if (!location.pathname.startsWith("/ocr")) window.location.href = "/ocr/bill";
                  }}
                >
                  <FileText />
                  {!collapsed && <span>OCR</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem key="menu-vision">
                <SidebarMenuButton
                  tooltip={{ children: "Vision AI", hidden: false }}
                  className="overflow-hidden"
                  onClick={() => {
                    if (!location.pathname.startsWith("/vision")) window.location.href = "/vision/flower";
                  }}
                >
                  <Eye />
                  {!collapsed && <span>Vision AI</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="menu-new">
                <SidebarMenuButton
                  onClick={() => {
                    if (isOcr) {
                      window.dispatchEvent(new CustomEvent("ocr:new"));
                    } else {
                      onNewChat();
                    }
                  }}
                  tooltip={{ children: isOcr ? "New Image" : "New Chat", hidden: false }}
                  className="overflow-hidden bg-gradient-to-r from-primary to-accent text-primary-foreground hover:brightness-110"
                >
                  <Plus />
                  {!collapsed && <span className="font-medium">{isOcr ? "New Image" : "New Chat"}</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isOcr && !collapsed && (
          <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
            <SidebarGroupLabel>OCR History</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="min-h-0 max-h-full overflow-y-auto pr-1">
                <SidebarMenu>
                  {ocrItems.length === 0 ? (
                    <SidebarMenuItem key="ocr-empty">
                      <SidebarMenuButton disabled className="opacity-60">
                        No history
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    ocrItems.map((item, idx) => (
                      <SidebarMenuItem key={`${item.type}-${item.id}-${idx}`}>
                        <SidebarMenuButton
                          tooltip={{ children: item.filename || (item.type === "bill" ? "Bill" : "Bank"), hidden: false }}
                          className="overflow-hidden"
                          onClick={() => (window.location.href = `/ocr/${item.type}/${item.id}`)}
                        >
                          <FileText />
                          {!collapsed && <span className="truncate flex-1">{item.filename || (item.type === "bill" ? "Bill" : "Bank")}</span>}
                          {!collapsed && item.approved && (
                            <CheckCircle2 className="ml-1 h-4 w-4 text-green-600 dark:text-green-400" aria-label="Approved" />
                          )}
                          {!collapsed && <Badge variant="outline" className="ml-auto capitalize">{item.type}</Badge>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarSeparator />

        {!collapsed && !isOcr && (
          <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
            <SidebarGroupLabel>History</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="min-h-0 max-h-full overflow-y-auto pr-1">
                {groups.recent.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wide">Recently</div>
                    <SidebarMenu>
                      {groups.recent.map((chat, idx) => (
                        <SidebarMenuItem key={chatKey(chat, idx)}>
                          <SidebarMenuButton
                            isActive={activeId === chatIdStr(chat.id)}
                            onClick={() => onSelect(chatIdStr(chat.id))}
                            tooltip={{ children: chat.title, hidden: false }}
                            className="overflow-hidden"
                          >
                            <MessageSquare />
                            <span className="truncate">{chat.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction aria-label="Chat actions">…</SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50">
                              <DropdownMenuItem
                                onClick={() => {
                                  const name = window.prompt("Rename chat", chat.title);
                                  if (name) onRename(chatIdStr(chat.id), name);
                                }}
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(chatIdStr(chat.id))}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                )}

                {groups.last7.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wide">Last 7 Days</div>
                    <SidebarMenu>
                      {groups.last7.map((chat, idx) => (
                        <SidebarMenuItem key={chatKey(chat, idx)}>
                          <SidebarMenuButton
                            isActive={activeId === chatIdStr(chat.id)}
                            onClick={() => onSelect(chatIdStr(chat.id))}
                            tooltip={{ children: chat.title, hidden: false }}
                            className="overflow-hidden"
                          >
                            <MessageSquare />
                            <span className="truncate">{chat.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction aria-label="Chat actions">…</SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50">
                              <DropdownMenuItem
                                onClick={() => {
                                  const name = window.prompt("Rename chat", chat.title);
                                  if (name) onRename(chatIdStr(chat.id), name);
                                }}
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(chatIdStr(chat.id))}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                )}

                {groups.last30.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wide">Last 30 Days</div>
                    <SidebarMenu>
                      {groups.last30.map((chat, idx) => (
                        <SidebarMenuItem key={chatKey(chat, idx)}>
                          <SidebarMenuButton
                            isActive={activeId === chatIdStr(chat.id)}
                            onClick={() => onSelect(chatIdStr(chat.id))}
                            tooltip={{ children: chat.title, hidden: false }}
                            className="overflow-hidden"
                          >
                            <MessageSquare />
                            <span className="truncate">{chat.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction aria-label="Chat actions">…</SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50">
                              <DropdownMenuItem
                                onClick={() => {
                                  const name = window.prompt("Rename chat", chat.title);
                                  if (name) onRename(chatIdStr(chat.id), name);
                                }}
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(chatIdStr(chat.id))}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                )}

                {groups.older.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wide">Older</div>
                    <SidebarMenu>
                      {groups.older.map((chat, idx) => (
                        <SidebarMenuItem key={chatKey(chat, idx)}>
                          <SidebarMenuButton
                            isActive={activeId === chatIdStr(chat.id)}
                            onClick={() => onSelect(chatIdStr(chat.id))}
                            tooltip={{ children: chat.title, hidden: false }}
                            className="overflow-hidden"
                          >
                            <MessageSquare />
                            <span className="truncate">{chat.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction aria-label="Chat actions">…</SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50">
                              <DropdownMenuItem
                                onClick={() => {
                                  const name = window.prompt("Rename chat", chat.title);
                                  if (name) onRename(chatIdStr(chat.id), name);
                                }}
                              >
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(chatIdStr(chat.id))}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarFooter className="mt-auto">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem key="menu-profile">
                  <Popover>
                    <PopoverTrigger asChild>
                      <SidebarMenuButton
                        tooltip={{ children: "Profile", hidden: false }}
                        className={`overflow-hidden ${collapsed ? "w-full justify-center mx-auto" : "justify-start"}`}
                      >
                        <div className="[&_svg]:h-4 [&_svg]:w-4 relative">
                          <User />
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive"
                            aria-hidden
                          />
                        </div>
                        {!collapsed && <span>Profile</span>}
                      </SidebarMenuButton>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="p-1 w-56">
                      <div className="flex flex-col">
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => (window.location.href = "/")}>
                          <Home className="h-4 w-4" /> Home
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => (window.location.href = "/profile")}>
                          <User className="h-4 w-4" /> User Profile
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => (window.location.href = "/notifications")}>
                          <Bell className="h-4 w-4" /> Notifications
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1">
                            3
                          </span>
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => (window.location.href = "/help")}>
                          <HelpCircle className="h-4 w-4" /> Help
                        </button>
                        <div className="my-1 border-t" />
                        {loggedIn ? (
                          <button
                            className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted"
                            onClick={async () => {
                              try {
                                await service.signOut();
                              } catch {
                                // ignore
                              } finally {
                                window.location.href = "/auth";
                              }
                            }}
                          >
                            <LogOut className="h-4 w-4" /> Logout
                          </button>
                        ) : (
                          <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => (window.location.href = "/auth")}>
                            <LogIn className="h-4 w-4" /> Login
                          </button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
}
