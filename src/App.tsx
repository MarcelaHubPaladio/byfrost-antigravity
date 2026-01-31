import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SessionProvider } from "@/providers/SessionProvider";
import { TenantProvider } from "@/providers/TenantProvider";

import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import TenantSelect from "@/pages/TenantSelect";
import Dashboard from "@/pages/Dashboard";
import CaseDetail from "@/pages/CaseDetail";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Crm from "@/pages/Crm";
import CrmCaseDetail from "@/pages/CrmCaseDetail";
import Chats from "@/pages/Chats";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionProvider>
        <TenantProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/tenants" element={<TenantSelect />} />

              {/* Dashboard por jornada (slug = journeys.key) */}
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/j/:journeyKey" element={<Dashboard />} />
              <Route path="/app/crm" element={<Crm />} />
              <Route path="/app/chat" element={<Chats />} />
              <Route path="/app/chat/:id" element={<Chats />} />

              {/* Detalhes */}
              <Route path="/app/cases/:id" element={<CaseDetail />} />
              <Route path="/crm/cases/:id" element={<CrmCaseDetail />} />

              <Route path="/app/simulator" element={<Simulator />} />
              <Route path="/app/settings" element={<Settings />} />
              <Route path="/app/admin" element={<Admin />} />

              {/* Back-compat */}
              <Route path="/dashboard" element={<Navigate to="/app" replace />} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TenantProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;