// src/components/layout/SidebarShell.tsx
import { PropsWithChildren } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const NO_LAYOUT_SCROLL = [
  /^\/chat\b/i,
  /^\/chatbot\b/i,
  /^\/home\b/i, // include if your chatbot is at /home
];

function usePageSkipsLayoutScroll() {
  const { pathname } = useLocation();
  return NO_LAYOUT_SCROLL.some((rx) => rx.test(pathname));
}

export default function SidebarShell({ children }: PropsWithChildren) {
  const skipLayoutScroll = usePageSkipsLayoutScroll();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar
          chats={[]}
          activeId={null}
          onSelect={() => (window.location.href = "/")}
          onNewChat={() => (window.location.href = "/")}
          onRename={() => {}}
          onDelete={() => {}}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2">
            <SidebarTrigger className="mr-2" />
          </header>

          <main className="flex-1 min-h-0">
            {skipLayoutScroll ? (
              // Chatbot (or any route matched above): unchanged
              children ?? <Outlet />
            ) : (
              // All other pages: make the page area scrollable
              // 3rem = h-12 header; use dynamic viewport for mobile
              <div className="h-[calc(100dvh-3rem)] overflow-auto min-h-0">
                {children ?? <Outlet />}
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
