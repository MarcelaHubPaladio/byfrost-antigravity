import { lazy, Suspense } from "react";
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
  RequireTvCorporativaEnabled,
} from "@/components/RequireTvCorporativaEnabled";
import { RequireChatInstanceAccess } from "@/components/RequireChatInstanceAccess";
import { RequireFinanceEnabled } from "@/components/RequireFinanceEnabled";
import { RequireSimulatorEnabled } from "@/components/RequireSimulatorEnabled";
import { RequireLinkManagerEnabled } from "@/components/RequireLinkManagerEnabled";
import { RequirePortalEnabled } from "@/components/RequirePortalEnabled";

// Lazy-loaded components
const Index = lazy(() => import("@/pages/Index"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Login = lazy(() => import("@/pages/Login"));
const TenantSelect = lazy(() => import("@/pages/TenantSelect"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Trello = lazy(() => import("@/pages/Trello"));
const TrelloCase = lazy(() => import("@/pages/TrelloCase"));
const CaseDetail = lazy(() => import("@/pages/CaseDetail"));
const Simulator = lazy(() => import("@/pages/Simulator"));
const Settings = lazy(() => import("@/pages/Settings"));
const Me = lazy(() => import("@/pages/Me"));
const Admin = lazy(() => import("@/pages/Admin"));
const GoalsCenter = lazy(() => import("@/pages/GoalsCenter"));
const AdminUserDetail = lazy(() => import("@/pages/AdminUserDetail"));
const Crm = lazy(() => import("@/pages/Crm"));
const CrmCaseDetail = lazy(() => import("@/pages/CrmCaseDetail"));
const Chats = lazy(() => import("@/pages/Chats"));
const Presence = lazy(() => import("@/pages/Presence"));
const PresenceManage = lazy(() => import("@/pages/PresenceManage"));
const IntegrationsMeta = lazy(() => import("@/pages/IntegrationsMeta"));
const Content = lazy(() => import("@/pages/Content"));
const ContentDetail = lazy(() => import("@/pages/ContentDetail"));
const Screen = lazy(() => import("@/pages/Screen"));
const PublicCampaignRanking = lazy(() => import("@/pages/PublicCampaignRanking"));
const IncentivesEventsManage = lazy(() => import("@/pages/IncentivesEventsManage"));
const FinanceIngestion = lazy(() => import("@/pages/FinanceIngestion"));
const FinancePlanning = lazy(() => import("@/pages/FinancePlanning"));
const FinanceLedger = lazy(() => import("@/pages/FinanceLedger"));
const FinanceTensions = lazy(() => import("@/pages/FinanceTensions"));
const FinanceDecisions = lazy(() => import("@/pages/FinanceDecisions"));
const FinanceControlTower = lazy(() => import("@/pages/FinanceControlTower"));
const FinanceDecisionBoard = lazy(() => import("@/pages/FinanceDecisionBoard"));
const Commitments = lazy(() => import("@/pages/Commitments"));
const CommitmentDetail = lazy(() => import("@/pages/CommitmentDetail"));
const Entities = lazy(() => import("@/pages/Entities"));
const EntityDetail = lazy(() => import("@/pages/EntityDetail"));
const DeliverableTemplates = lazy(() => import("@/pages/DeliverableTemplates"));
const PublicProposal = lazy(() => import("@/pages/PublicProposal"));
const ContractTemplates = lazy(() => import("@/pages/ContractTemplates"));
const TvCorporativaAdmin = lazy(() => import("@/pages/TvCorporativaAdmin"));
const TvPlayer = lazy(() => import("@/pages/TvPlayer"));
const TvTimelineEditor = lazy(() => import("@/pages/TvTimelineEditor"));
const PublicEntityTvUpload = lazy(() => import("@/pages/PublicEntityTvUpload"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const InventoryDetail = lazy(() => import("@/pages/InventoryDetail"));
const LinkManager = lazy(() => import("@/pages/LinkManager"));
const PublicLinks = lazy(() => import("@/pages/PublicLinks"));
const PortalManager = lazy(() => import("@/pages/PortalManager"));
const PortalEditor = lazy(() => import("@/pages/PortalEditor"));
const PublicPortal = lazy(() => import("@/pages/PublicPortal"));

const GlobalLoading = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-800" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    },
  },
});
const SmartNotFound = () => {
  const hostname = window.location.hostname;
  const isMainDomain = hostname.includes('localhost') || 
                      hostname.includes('byfrost') || 
                      hostname.includes('m30.company') || 
                      hostname.endsWith('.vercel.app');

  if (!isMainDomain) {
    return <PublicPortal />;
  }
  return <NotFound />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionProvider>
        <ThemeProvider>
          <TenantProvider>
            <BrowserRouter>
              <Suspense fallback={<GlobalLoading />}>
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

                  {/* Public Portal (no auth) */}
                  <Route path="/portal/:tenantSlug/:slug" element={<PublicPortal />} />
                  <Route path="/l/:tenantSlug/p/:slug" element={<PublicPortal />} />
                  <Route path="/l/:slug" element={<PublicPortal />} />

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
                        <RequireLinkManagerEnabled>
                          <LinkManager />
                        </RequireLinkManagerEnabled>
                      </RequireRouteAccess>
                    }
                  />

                  <Route
                    path="/app/portal"
                    element={
                      <RequireRouteAccess routeKey="app.settings">
                        <RequirePortalEnabled>
                          <PortalManager />
                        </RequirePortalEnabled>
                      </RequireRouteAccess>
                    }
                  />
                  <Route
                    path="/app/portal/edit/:id"
                    element={
                      <RequireRouteAccess routeKey="app.settings">
                        <RequirePortalEnabled>
                          <PortalEditor />
                        </RequirePortalEnabled>
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
                  <Route path="*" element={<SmartNotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TenantProvider>
        </ThemeProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider >
);

export default App;