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
import { RequireFinanceEnabled } from "@/components/RequireFinanceEnabled";
import { RequireSimulatorEnabled } from "@/components/RequireSimulatorEnabled";

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
import FinanceDecisionBoard from "@/pages/FinanceDecisionBoard";
import Commitments from "@/pages/Commitments";
import CommitmentDetail from "@/pages/CommitmentDetail";
import Entities from "@/pages/Entities";
import EntityDetail from "@/pages/EntityDetail";

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
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.cockpit">
                        <FinanceControlTower />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/board"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.board">
                        <FinanceDecisionBoard />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/ledger"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.ledger">
                        <FinanceLedger />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/tensions"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.tensions">
                        <FinanceTensions />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/decisions"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.decisions">
                        <FinanceDecisions />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/ingestion"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.ingestion">
                        <FinanceIngestion />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
                  }
                />
                <Route
                  path="/app/finance/planning"
                  element={
                    <RequireFinanceEnabled>
                      <RequireRouteAccess routeKey="app.finance.planning">
                        <FinancePlanning />
                      </RequireRouteAccess>
                    </RequireFinanceEnabled>
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

                {/* Core */}
                <Route
                  path="/app/entities"
                  element={
                    <RequireRouteAccess routeKey="app.entities">
                      <Entities />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/entities/:id"
                  element={
                    <RequireRouteAccess routeKey="app.entities">
                      <EntityDetail />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/commitments"
                  element={
                    <RequireRouteAccess routeKey="app.commitments">
                      <Commitments />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/commitments/:id"
                  element={
                    <RequireRouteAccess routeKey="app.commitments">
                      <CommitmentDetail />
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
                    <RequireSimulatorEnabled>
                      <RequireRouteAccess routeKey="app.simulator">
                        <Simulator />
                      </RequireRouteAccess>
                    </RequireSimulatorEnabled>
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
                  path="/app/admin"
                  element={
                    <RequireTenantRole roles={["admin"]}>
                      <Admin />
                    </RequireTenantRole>
                  }
                />

                <Route path="*" element={<NotFound />} />
                <Route path="/app/*" element={<Navigate to="/app" replace />} />
              </Routes>
            </BrowserRouter>
          </TenantProvider>
        </ThemeProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;