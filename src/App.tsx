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
import { RequireChatInstanceAccess } from "@/components/RequireChatInstanceAccess";

import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import TenantSelect from "@/pages/TenantSelect";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import CaseDetail from "@/pages/CaseDetail";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Me from "@/pages/Me";
import Admin from "@/pages/Admin";
import Crm from "@/pages/Crm";
import CrmCaseDetail from "@/pages/CrmCaseDetail";
import Chats from "@/pages/Chats";
import Presence from "@/pages/Presence";
import PresenceManage from "@/pages/PresenceManage";
import IntegrationsMeta from "@/pages/IntegrationsMeta";
import Content from "@/pages/Content";
import ContentDetail from "@/pages/ContentDetail";
import Screen from "@/pages/Screen";
import PublicCampaignRanking from "@/pages/PublicCampaignRanking";
import IncentivesEventsManage from "@/pages/IncentivesEventsManage";
import FinanceIngestion from "@/pages/FinanceIngestion";
import FinancePlanning from "@/pages/FinancePlanning";
import FinanceLedger from "@/pages/FinanceLedger";
import FinanceTensions from "@/pages/FinanceTensions";
import FinanceDecisions from "@/pages/FinanceDecisions";
import FinanceControlTower from "@/pages/FinanceControlTower";

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
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/reset" element={<ResetPassword />} />

                {/* Public screen (no protection) */}
                <Route path="/screen" element={<Screen />} />

                {/* Incentive Engine (public ranking; no auth) */}
                <Route path="/incentives/:tenant/:campaign" element={<PublicCampaignRanking />} />

                {/* Incentives (gestão interna; protegido por matriz de acesso) */}
                <Route
                  path="/app/incentives/events"
                  element={
                    <RequireRouteAccess routeKey="app.incentives_events_manage">
                      <IncentivesEventsManage />
                    </RequireRouteAccess>
                  }
                />

                {/* Financeiro */}
                <Route
                  path="/app/finance"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinanceControlTower />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/finance/ledger"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinanceLedger />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/finance/tensions"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinanceTensions />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/finance/decisions"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinanceDecisions />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/finance/ingestion"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinanceIngestion />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/finance/planning"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <FinancePlanning />
                    </RequireRouteAccess>
                  }
                />

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
                      <RequireChatInstanceAccess>
                        <Chats />
                      </RequireChatInstanceAccess>
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/chat/:id"
                  element={
                    <RequireRouteAccess routeKey="app.chat">
                      <RequireChatInstanceAccess>
                        <Chats />
                      </RequireChatInstanceAccess>
                    </RequireRouteAccess>
                  }
                />

                {/* Conteúdo (meta_content) */}
                <Route
                  path="/app/content"
                  element={
                    <RequireRouteAccess routeKey="app.content">
                      <Content />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/content/:id"
                  element={
                    <RequireRouteAccess routeKey="app.content">
                      <ContentDetail />
                    </RequireRouteAccess>
                  }
                />

                {/* Presença (opcional por tenant) */}
                <Route
                  path="/app/presence"
                  element={
                    <RequireRouteAccess routeKey="app.presence">
                      <Presence />
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

                {/* Integrações */}
                <Route
                  path="/app/integrations/meta"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <IntegrationsMeta />
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

                {/* Super-admin only */}
                <Route
                  path="/app/admin"
                  element={
                    <RequireTenantRole roles={["admin"]}>
                      <Admin />
                    </RequireTenantRole>
                  }
                />

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