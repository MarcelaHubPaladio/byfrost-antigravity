import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SessionProvider } from "@/providers/SessionProvider";
import { TenantProvider } from "@/providers/TenantProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { RequireTenantRole } from "@/components/RequireTenantRole";
import { RequireRouteAccess } from "./components/RequireRouteAccess";
import { RequireGoalsEnabled } from "./components/RequireGoalsEnabled";
import {
  isTvCorporativaEnabled,
  RequireTvCorporativaEnabled,
} from "@/components/RequireTvCorporativaEnabled";
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
import Trello from "@/pages/Trello";
import TrelloCase from "@/pages/TrelloCase";
import CaseDetail from "@/pages/CaseDetail";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Me from "@/pages/Me";
import Admin from "@/pages/Admin";
import GoalsCenter from "@/pages/GoalsCenter";
import AdminUserDetail from "@/pages/AdminUserDetail";
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
import DeliverableTemplates from "@/pages/DeliverableTemplates";
import PublicProposal from "@/pages/PublicProposal";
import ContractTemplates from "@/pages/ContractTemplates";
import TvCorporativaAdmin from "@/pages/TvCorporativaAdmin";
import TvPlayer from "@/pages/TvPlayer";
import TvTimelineEditor from "@/pages/TvTimelineEditor";
import PublicEntityTvUpload from "@/pages/PublicEntityTvUpload";
import Inventory from "@/pages/Inventory";
import InventoryDetail from "@/pages/InventoryDetail";
import LinkManager from "@/pages/LinkManager";
import PublicLinks from "@/pages/PublicLinks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    },
  },
});

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

                {/* Public proposal (no auth) */}
                <Route path="/p/:tenantSlug/:token" element={<PublicProposal />} />

                {/* TV Player (no protection initially, just specific route) */}
                <Route path="/tv/:pointId" element={<TvPlayer />} />
                <Route path="/tv-upload/:token" element={<PublicEntityTvUpload />} />

                {/* Public screen (no protection) */}
                <Route path="/screen" element={<Screen />} />

                {/* Incentive Engine (public ranking; no auth) */}
                <Route path="/incentives/:tenant/:campaign" element={<PublicCampaignRanking />} />

                {/* Public LinkTree (no auth) */}
                <Route path="/l/:tenantSlug/:groupSlug" element={<PublicLinks />} />

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
                  path="/app/trello"
                  element={
                    <RequireRouteAccess routeKey="app.trello">
                      <Trello />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/j/trello"
                  element={
                    <RequireRouteAccess routeKey="app.trello">
                      <Trello />
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
                  path="/app/inventory"
                  element={
                    <RequireRouteAccess routeKey="app.inventory">
                      <Inventory />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/inventory/new"
                  element={
                    <RequireRouteAccess routeKey="app.inventory">
                      <InventoryDetail />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/inventory/:id"
                  element={
                    <RequireRouteAccess routeKey="app.inventory">
                      <InventoryDetail />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/catalog/deliverable-templates"
                  element={
                    <RequireRouteAccess routeKey="app.entities">
                      <DeliverableTemplates />
                    </RequireRouteAccess>
                  }
                />
                <Route
                  path="/app/catalog/contract-templates"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <ContractTemplates />
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

                {/* TV Corporativa (Admin Tenant) */}
                <Route
                  path="/app/tv-corporativa"
                  element={
                    <RequireTvCorporativaEnabled>
                      <RequireRouteAccess routeKey="app.tv_corporativa">
                        <TvCorporativaAdmin />
                      </RequireRouteAccess>
                    </RequireTvCorporativaEnabled>
                  }
                />
                <Route
                  path="/app/tv/timeline/:id"
                  element={
                    <RequireTvCorporativaEnabled>
                      <RequireRouteAccess routeKey="app.tv_corporativa">
                        <TvTimelineEditor />
                      </RequireRouteAccess>
                    </RequireTvCorporativaEnabled>
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
                    <RequireTenantRole roles={["admin", "manager"]}>
                      <RequireRouteAccess routeKey="app.presence_manage">
                        <PresenceManage />
                      </RequireRouteAccess>
                    </RequireTenantRole>
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
                  path="/app/settings"
                  element={
                    <RequireRouteAccess routeKey="app.settings">
                      <Settings />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/link-manager"
                  element={
                    <RequireRouteAccess routeKey="app.link_manager">
                      <LinkManager />
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
                  path="/app/admin"
                  element={
                    <RequireTenantRole roles={["admin"]}>
                      <RequireRouteAccess routeKey="app.admin">
                        <Admin />
                      </RequireRouteAccess>
                    </RequireTenantRole>
                  }
                />
                <Route
                  path="/app/goals"
                  element={
                    <RequireGoalsEnabled>
                      <RequireRouteAccess routeKey="app.goals">
                        <GoalsCenter />
                      </RequireRouteAccess>
                    </RequireGoalsEnabled>
                  }
                />
                <Route
                  path="/app/admin/users/:id"
                  element={
                    <RequireTenantRole roles={["admin"]}>
                      <RequireRouteAccess routeKey="app.admin">
                        <AdminUserDetail />
                      </RequireRouteAccess>
                    </RequireTenantRole>
                  }
                />

                <Route
                  path="/crm/cases/:id"
                  element={
                    <RequireRouteAccess routeKey="app.crm">
                      <CrmCaseDetail />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/app/trello/:id"
                  element={
                    <RequireRouteAccess routeKey="app.trello">
                      <TrelloCase />
                    </RequireRouteAccess>
                  }
                />

                <Route
                  path="/cases/:id"
                  element={
                    <RequireRouteAccess routeKey="app.dashboard">
                      <CaseDetail />
                    </RequireRouteAccess>
                  }
                />

                {/* Default redirects */}
                <Route path="/app/*" element={<Navigate to="/app" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TenantProvider>
        </ThemeProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider >
);

export default App;