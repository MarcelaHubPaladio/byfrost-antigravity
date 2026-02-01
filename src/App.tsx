import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SessionProvider } from "@/providers/SessionProvider";
import { TenantProvider } from "@/providers/TenantProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { RequireTenantRole } from "@/components/RequireTenantRole";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";

import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import TenantSelect from "@/pages/TenantSelect";
import Dashboard from "@/pages/Dashboard";
import CaseDetail from "@/pages/CaseDetail";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Me from "@/pages/Me";
import Admin from "@/pages/Admin";
import Crm from "@/pages/Crm";
import CrmCaseDetail from "@/pages/CrmCaseDetail";
import Chats from "@/pages/Chats";
import PresenceClock from "@/pages/PresenceClock";
import PresenceManage from "@/pages/PresenceManage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionProvider>
        <ThemeProvider>
          <TenantProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/tenants" element={<TenantSelect />} />

                {/* Dashboard por jornada (slug = journeys.key) */}
                <Route
                  path="/app"
                  element={
                    <RequireRouteAccess routeKey="app.dashboard">
                      <Dashboard />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/j/:journeyKey"
                  element={
                    <RequireRouteAccess routeKey="app.dashboard">
                      <Dashboard />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/crm"
                  element={
                    <RequireRouteAccess routeKey="app.crm">
                      <Crm />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/chat"
                  element={
                    <RequireRouteAccess routeKey="app.chat">
                      <Chats />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/chat/:id"
                  element={
                    <RequireRouteAccess routeKey="app.chat">
                      <Chats />
                    </RequireRouteAccess>
                  }
                />

                {/* Detalhes */}
                <Route
                  path="/app/cases/:id"
                  element={
                    <RequireRouteAccess routeKey="app.case_detail">
                      <CaseDetail />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/crm/cases/:id"
                  element={
                    <RequireRouteAccess routeKey="crm.case_detail">
                      <CrmCaseDetail />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/simulator"
                  element={
                    <RequireRouteAccess routeKey="app.simulator">
                      <Simulator />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/me"
                  element={
                    <RequireRouteAccess routeKey="app.me">
                      <Me />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/settings"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <Settings />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/presence"
                  element={
                    <RequireRouteAccess routeKey="app.presence">
                      <PresenceClock />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/presence/manage"
                  element={
                    <RequireRouteAccess routeKey="app.presence_manage">
                      <PresenceManage />
                    </RequireRouteAccess>
                  }
                />

                {/* Super-admin only */}
                <Route
                  path="/app/admin"
                  element={
                    <RequireTenantRole roles={["admin"]}>
                      <Admin />
                    </RequireTenantRole>
                  }
                />

                {/* Back-compat */}
                <Route path="/dashboard" element={<Navigate to="/app" replace />} />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TenantProvider>
        </ThemeProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;