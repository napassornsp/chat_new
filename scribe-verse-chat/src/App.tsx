// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// Core pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Notifications from "./pages/Notifications";
import Help from "./pages/Help";
import Profile from "./pages/Profile";
import Pricing from "./pages/Pricing";

// Layout
import SidebarShell from "./components/layout/SidebarShell";

// ✅ OCR pages to keep
import OCRBill from "./pages/ocr/Bill";
import OCRBank from "./pages/ocr/Bank";

// Vision demos (optional)
import VisionFlower from "./pages/vision/Flower";
import VisionFood from "./pages/vision/Food";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* public / auth */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/register" element={<Auth />} />

            {/* app shell */}
            <Route element={<SidebarShell />}>
              <Route path="/home" element={<Home />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/help" element={<Help />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/pricing" element={<Pricing />} />

              {/* OCR — only Bill & Bank */}
              <Route path="/ocr/bill" element={<OCRBill />} />
              <Route path="/ocr/bank" element={<OCRBank />} />

              {/* Vision demo (remove if not needed) */}
              <Route path="/vision/flower" element={<VisionFlower />} />
              <Route path="/vision/food" element={<VisionFood />} />
              <Route path="/vision/pet" element={<VisionFood />} />
            </Route>

            {/* redirects */}
            <Route path="/ocr" element={<Navigate to="/ocr/bill" replace />} />
            <Route path="/vision" element={<Navigate to="/vision/flower" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
