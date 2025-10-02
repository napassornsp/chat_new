import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Notifications from "./pages/Notifications";
import Help from "./pages/Help";
import Profile from "./pages/Profile";
import Pricing from "./pages/Pricing";
import SidebarShell from "./components/layout/SidebarShell";
import OCRBill from "./pages/ocr/Bill";
import OCRBank from "./pages/ocr/Bank";
import VisionFlower from "./pages/vision/Flower";
import VisionFood from "./pages/vision/Food";
import OCRHistory from "./pages/OCRHistory";
import BillDetail from "./pages/ocr/BillDetail";
import BankDetail from "./pages/ocr/BankDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
           <Routes>
             <Route path="/" element={<Index />} />
             <Route path="/auth" element={<Auth />} />
             <Route path="/login" element={<Auth />} />
             <Route path="/register" element={<Auth />} />

             <Route element={<SidebarShell />}>
               <Route path="/home" element={<Home />} />
               <Route path="/notifications" element={<Notifications />} />
               <Route path="/help" element={<Help />} />
               <Route path="/profile" element={<Profile />} />
               <Route path="/pricing" element={<Pricing />} />
               {/* OCR */}
               <Route path="/ocr/bill" element={<OCRBill />} />
               <Route path="/ocr/bank" element={<OCRBank />} />
               <Route path="/ocr/history" element={<OCRHistory />} />
                <Route path="/ocr/bill/:id" element={<BillDetail />} />
                <Route path="/ocr/bank/:id" element={<BankDetail />} />
               {/* Vision AI */}
               <Route path="/vision/flower" element={<VisionFlower />} />
               <Route path="/vision/food" element={<VisionFood />} />
             </Route>

             {/* Redirect old routes to new defaults */}
             <Route path="/ocr" element={<Navigate to="/ocr/bill" replace />} />
             <Route path="/vision" element={<Navigate to="/vision/flower" replace />} />

             {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
             <Route path="*" element={<NotFound />} />
           </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
