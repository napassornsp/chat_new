import { PropsWithChildren } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export default function SidebarShell({ children }: PropsWithChildren) {
  // Use children if provided, otherwise render nested routes via Outlet
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
            {/* You can add breadcrumbs or a page title here if needed */}
          </header>
          <main className="flex-1 min-h-0">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
