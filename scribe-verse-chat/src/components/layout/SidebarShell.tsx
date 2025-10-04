// src/components/layout/SidebarShell.tsx
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import type { Chat } from "@/services/types";

type Props = {
  chats?: Chat[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onNewChat?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  loggedIn?: boolean;
};

export default function SidebarShell({
  chats = [],
  activeId = null,
  onSelect = () => {},
  onNewChat = () => {},
  onRename = () => {},
  onDelete = () => {},
  loggedIn = false,
}: Props) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Left sidebar */}
        <AppSidebar
          chats={chats}
          activeId={activeId}
          onSelect={onSelect}
          onNewChat={onNewChat}
          onRename={onRename}
          onDelete={onDelete}
          loggedIn={loggedIn}
        />

        {/* Main content area for nested routes */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
