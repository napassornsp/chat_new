import { useEffect, useMemo, useState } from "react";
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
import { useLocation, useNavigate } from "react-router-dom";

/* --------------------------- offline API helpers --------------------------- */
const API = import.meta.env.VITE_OFFLINE_API || "http://localhost:5001";

function authHeaders() {
  const token = localStorage.getItem("offline_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function selectTable<T = any>(table: string, params: Record<string, string> = {}) {
  const u = new URL(`${API}/db/${table}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString(), { headers: authHeaders() });
  if (!r.ok) throw new Error(`Failed to load ${table}`);
  const j = await r.json();
  return (j?.rows ?? []) as T[];
}

/* ---------------------------- OCR history typing ---------------------------- */
type OcrItem = {
  id: string;
  type: "bill" | "bank";
  filename: string | null;
  created_at: string;
  approved?: boolean;
  file_url?: string | null;
};

interface AppSidebarProps {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  loggedIn?: boolean;
}

export function AppSidebar({
  chats,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  loggedIn,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  // ---- precise route flags ----
  const isChatRoute = location.pathname === "/" || location.pathname.startsWith("/chat");
  const isOcr = location.pathname.startsWith("/ocr");
  const isVision = location.pathname.startsWith("/vision");

  /* --------------------------- Notifications count --------------------------- */
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnreadCount = async () => {
    try {
      const r = await fetch(`${API}/notifications/count`, { headers: authHeaders() });
      if (!r.ok) {
        setUnreadCount(0);
        return;
      }
      const j = await r.json();
      setUnreadCount(Number(j?.unread || 0));
    } catch {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    // initial + polling refresh
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, 30_000);

    // refresh when notifications page updates something
    const onUpdated = () => fetchUnreadCount();
    window.addEventListener("notifications:updated" as any, onUpdated as any);

    return () => {
      clearInterval(t);
      window.removeEventListener("notifications:updated" as any, onUpdated as any);
    };
  }, []);

  /* --------------------------- OCR history state --------------------------- */
  const [ocrItems, setOcrItems] = useState<OcrItem[]>([]);

  const loadOcr = async () => {
    try {
      const [bills, banks] = await Promise.all([
        selectTable<any>("ocr_bill_extractions", { _order_col: "created_at", _order_asc: "0", _limit: "50" }),
        selectTable<any>("ocr_bank_extractions", { _order_col: "created_at", _order_asc: "0", _limit: "50" }),
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
      setOcrItems([]);
    }
  };

  useEffect(() => {
    if (!isOcr) return;
    loadOcr();
    const onRefresh = () => loadOcr();
    window.addEventListener("ocr:refresh" as any, onRefresh as any);
    return () => window.removeEventListener("ocr:refresh" as any, onRefresh as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOcr]);

  /* ---------------------------- group chats (UI) --------------------------- */
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
      const days = getAgeDays((c as any).created_at);
      if (days <= 1) recent.push(c);
      else if (days <= 7) last7.push(c);
      else if (days <= 30) last30.push(c);
      else older.push(c);
    }
    return { recent, last7, last30, older };
  }, [chats]);

  const chatKey = (c: Chat, index: number) => String((c as any).id ?? `${c.title ?? "untitled"}-${index}`);
  const chatIdStr = (id: string | number | null | undefined) => String(id ?? "");

  return (
    <Sidebar collapsible="icon" className="h-screen overflow-hidden z-[3]">
      <SidebarContent className="overflow-hidden">
        {/* ---------- Header / Logo ---------- */}
        <SidebarHeader>
          <div className="flex items-center justify-between px-2 py-2">
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
                  <img src="/jv_logo.jpg" alt="JV System" className="h-6 w-6 object-contain" />
                </div>
                <span className="font-semibold text-sm">JV System</span>
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center overflow-hidden">
                <img src="/jv_logo.jpg" alt="JV System" className="h-6 w-6 object-contain" />
              </div>
            )}

            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Expand sidebar" onClick={toggleSidebar}>
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Collapse sidebar" onClick={toggleSidebar}>
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse</TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        {/* ---------- Modules ---------- */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Modules</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="menu-chatbot">
                <SidebarMenuButton
                  isActive={isChatRoute}
                  tooltip={{ children: "Chatbot", hidden: false }}
                  className="overflow-hidden"
                  onClick={() => {
                    if (location.pathname !== "/") navigate("/");
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                  {!collapsed && <span>Chatbot</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem key="menu-ocr">
                <SidebarMenuButton
                  isActive={isOcr}
                  tooltip={{ children: "OCR", hidden: false }}
                  className="overflow-hidden"
                  onClick={() => {
                    if (!location.pathname.startsWith("/ocr")) navigate("/ocr/bill");
                  }}
                >
                  <FileText className="h-4 w-4" />
                  {!collapsed && <span>OCR</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem key="menu-vision">
                <SidebarMenuButton
                  isActive={isVision}
                  tooltip={{ children: "Vision AI", hidden: false }}
                  className="overflow-hidden"
                  onClick={() => {
                    if (!location.pathname.startsWith("/vision")) navigate("/vision/flower-classification");
                  }}
                >
                  <Eye className="h-4 w-4" />
                  {!collapsed && <span>Vision AI</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ---------- New (only on actual chat route OR OCR/Vision) ---------- */}
        {(isChatRoute || isOcr || isVision) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem key="menu-new">
                  <SidebarMenuButton
                    onClick={() => {
                      if (isOcr) {
                        window.dispatchEvent(new CustomEvent("ocr:new"));
                      } else if (isVision) {
                        window.dispatchEvent(new CustomEvent("vision:new"));
                      } else if (isChatRoute) {
                        onNewChat();
                      }
                    }}
                    tooltip={{
                      children: isOcr ? "New OCR" : isVision ? "New Image" : "New Chat",
                      hidden: false,
                    }}
                    className="overflow-hidden bg-gradient-to-r from-primary to-accent text-primary-foreground hover:brightness-110"
                  >
                    <Plus className="h-4 w-4" />
                    {!collapsed && (
                      <span className="font-medium">
                        {isOcr ? "New OCR" : isVision ? "New Image" : "New Chat"}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarSeparator />

        {/* ---------- OCR History (only on OCR pages) ---------- */}
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
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("ocr:open", { detail: { type: item.type, id: item.id } })
                            )
                          }
                        >
                          <FileText className="h-4 w-4" />
                          <span className="truncate flex-1">
                            {item.filename || (item.type === "bill" ? "Bill" : "Bank")}
                          </span>
                          {item.approved && (
                            <CheckCircle2 className="ml-1 h-4 w-4 text-green-600 dark:text-green-400" aria-label="Approved" />
                          )}
                          <Badge variant="outline" className="ml-auto capitalize">
                            {item.type}
                          </Badge>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ---------- Chat History (only on REAL chat route) ---------- */}
        {!collapsed && isChatRoute && (
          <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
            <SidebarGroupLabel>History</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="min-h-0 max-h-full overflow-y-auto pr-1">
                {["recent", "last7", "last30", "older"].map((bucket) => {
                  const label =
                    bucket === "recent" ? "Recently" : bucket === "last7" ? "Last 7 Days" : bucket === "last30" ? "Last 30 Days" : "Older";
                  const list = (groups as any)[bucket] as Chat[];
                  if (!list?.length) return null;
                  return (
                    <div className="mb-2" key={bucket}>
                      <div className="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
                      <SidebarMenu>
                        {list.map((chat, idx) => (
                          <SidebarMenuItem key={chatKey(chat, idx)}>
                            <SidebarMenuButton
                              isActive={activeId === chatIdStr((chat as any).id)}
                              onClick={() => onSelect(chatIdStr((chat as any).id))}
                              tooltip={{ children: chat.title, hidden: false }}
                              className="overflow-hidden"
                            >
                              <MessageSquare className="h-4 w-4" />
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
                                    if (name) onRename(chatIdStr((chat as any).id), name);
                                  }}
                                >
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDelete(chatIdStr((chat as any).id))}>
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </div>
                  );
                })}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ---------- Footer / Profile ---------- */}
        <SidebarFooter className="mt-auto">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem key="menu-profile">
                  <Popover>
                    <PopoverTrigger asChild>
                      <SidebarMenuButton
                        tooltip={{ children: "Profile", hidden: false }}
                        className={["overflow-hidden", collapsed ? "h-10 w-10 justify-center -translate-x-1" : "justify-start"].join(" ")}
                      >
                        <div className="relative">
                          <User className="h-4 w-4" />
                          {unreadCount > 0 && (
                            <span
                              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive"
                              aria-hidden
                            />
                          )}
                        </div>

                        {!collapsed && <span>Profile</span>}
                      </SidebarMenuButton>
                    </PopoverTrigger>

                    <PopoverContent align="end" className="p-1 w-56">
                      <div className="flex flex-col">
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => navigate("/home")}>
                          <Home className="h-4 w-4" /> Home
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => navigate("/profile")}>
                          <User className="h-4 w-4" /> User Profile
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => navigate("/notifications")}>
                          <Bell className="h-4 w-4" /> Notifications
                          {unreadCount > 0 && (
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1">
                              {unreadCount}
                            </span>
                          )}
                        </button>
                        <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => navigate("/help")}>
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
                                /* ignore */
                              }
                              navigate("/auth");
                            }}
                          >
                            <LogOut className="h-4 w-4" /> Logout
                          </button>
                        ) : (
                          <button className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted" onClick={() => navigate("/auth")}>
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
