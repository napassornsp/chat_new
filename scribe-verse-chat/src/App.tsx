// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// Vision demos
import VisionPetClassification from "./pages/vision/pet-classification";
import VisionPersonClassification from "./pages/vision/person-classification";
import VisionVehicleClassification from "./pages/vision/vehicle-classification";
import VisionPetDetection from "./pages/vision/pet-detection";
import VisionPersonDetection from "./pages/vision/person-detection";
import VisionVehicleDetection from "./pages/vision/vehicle-detection";
import VisionFlowerClassification from "./pages/vision/flower-classification";
import VisionFoodDetection from "./pages/vision/food-detection";

// Core pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Notifications from "./pages/Notifications";
import Help from "./pages/Help";
import Profile from "./pages/Profile";

// Layout (✅ default import)
import SidebarShell from "./components/layout/SidebarShell";

// OCR pages
import OCRBill from "./pages/ocr/Bill";
import OCRBank from "./pages/ocr/Bank";

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

              {/* OCR — only Bill & Bank */}
              <Route path="/ocr/bill" element={<OCRBill />} />
              <Route path="/ocr/bank" element={<OCRBank />} />

              {/* Vision demo */}
              <Route path="/vision/flower-classification" element={<VisionFlowerClassification />} />
              <Route path="/vision/food-detection" element={<VisionFoodDetection />} />
              <Route path="/vision/pet-classification" element={<VisionPetClassification />} />
              <Route path="/vision/person-classification" element={<VisionPersonClassification />} />
              <Route path="/vision/vehicle-classification" element={<VisionVehicleClassification />} />
              <Route path="/vision/pet-detection" element={<VisionPetDetection />} />
              <Route path="/vision/person-detection" element={<VisionPersonDetection />} />
              <Route path="/vision/vehicle-detection" element={<VisionVehicleDetection />} />
            </Route>

            {/* redirects */}
            <Route path="/ocr" element={<Navigate to="/ocr/bill" replace />} />
            <Route path="/vision" element={<Navigate to="/vision/flower-classification" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
