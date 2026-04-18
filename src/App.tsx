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
import { RequireProcessesEnabled } from "@/components/RequireProcessesEnabled";
import {
  RequireTvCorporativaEnabled,
} from "@/components/RequireTvCorporativaEnabled";
import { RequireChatInstanceAccess } from "@/components/RequireChatInstanceAccess";
import { RequireFinanceEnabled } from "@/components/RequireFinanceEnabled";
import { RequireSimulatorEnabled } from "@/components/RequireSimulatorEnabled";
import { RequireLinkManagerEnabled } from "@/components/RequireLinkManagerEnabled";
import { RequirePortalEnabled } from "@/components/RequirePortalEnabled";
import { RequireCommunicationEnabled } from "@/components/chat/RequireCommunicationEnabled";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy-loaded components
const Index = lazyWithRetry(() => import("@/pages/Index"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const Login = lazyWithRetry(() => import("@/pages/Login"));
const TenantSelect = lazyWithRetry(() => import("@/pages/TenantSelect"));
const AuthCallback = lazyWithRetry(() => import("@/pages/AuthCallback"));
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Trello = lazyWithRetry(() => import("@/pages/Trello"));
const TrelloCase = lazyWithRetry(() => import("@/pages/TrelloCase"));
const OperacaoM30Case = lazyWithRetry(() => import("@/pages/OperacaoM30Case"));
const CaseDetail = lazyWithRetry(() => import("@/pages/CaseDetail"));
const Simulator = lazyWithRetry(() => import("@/pages/Simulator"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));
const Me = lazyWithRetry(() => import("@/pages/Me"));
const Admin = lazyWithRetry(() => import("@/pages/Admin"));
const GoalsCenter = lazyWithRetry(() => import("@/pages/GoalsCenter"));
const AdminUserDetail = lazyWithRetry(() => import("@/pages/AdminUserDetail"));
const Crm = lazyWithRetry(() => import("@/pages/Crm"));
const CrmCaseDetail = lazyWithRetry(() => import("@/pages/CrmCaseDetail"));
const Orders = lazyWithRetry(() => import("@/pages/Orders"));
const SalesOrderCase = lazyWithRetry(() => import("@/pages/SalesOrderCase"));
const OperacaoM30 = lazyWithRetry(() => import("@/pages/OperacaoM30"));
const MktTecha = lazyWithRetry(() => import("@/pages/MktTecha"));
const MktTechaCase = lazyWithRetry(() => import("@/pages/MktTechaCase"));
const Chats = lazyWithRetry(() => import("@/pages/Chats"));
const Presence = lazyWithRetry(() => import("@/pages/Presence"));
const PresenceManage = lazyWithRetry(() => import("@/pages/PresenceManage"));
const IntegrationsMeta = lazyWithRetry(() => import("@/pages/IntegrationsMeta"));
const Content = lazyWithRetry(() => import("@/pages/Content"));
const ContentDetail = lazyWithRetry(() => import("@/pages/ContentDetail"));
const Screen = lazyWithRetry(() => import("@/pages/Screen"));
const PublicCampaignRanking = lazyWithRetry(() => import("@/pages/PublicCampaignRanking"));
const IncentivesEventsManage = lazyWithRetry(() => import("@/pages/IncentivesEventsManage"));
const FinanceIngestion = lazyWithRetry(() => import("@/pages/FinanceIngestion"));
const FinancePlanning = lazyWithRetry(() => import("@/pages/FinancePlanning"));
const FinanceLedger = lazyWithRetry(() => import("@/pages/FinanceLedger"));
const FinanceTensions = lazyWithRetry(() => import("@/pages/FinanceTensions"));
const FinanceDecisions = lazyWithRetry(() => import("@/pages/FinanceDecisions"));
const FinanceControlTower = lazyWithRetry(() => import("@/pages/FinanceControlTower"));
const FinanceDecisionBoard = lazyWithRetry(() => import("@/pages/FinanceDecisionBoard"));
const Contracts = lazyWithRetry(() => import("@/pages/Contracts"));
const Commitments = lazyWithRetry(() => import("@/pages/Commitments"));
const CommitmentDetail = lazyWithRetry(() => import("@/pages/CommitmentDetail"));
const Entities = lazyWithRetry(() => import("@/pages/Entities"));
const EntityDetail = lazyWithRetry(() => import("@/pages/EntityDetail"));
const DeliverableTemplates = lazyWithRetry(() => import("@/pages/DeliverableTemplates"));
const PublicProposal = lazyWithRetry(() => import("@/pages/PublicProposal"));
const ContractTemplates = lazyWithRetry(() => import("@/pages/ContractTemplates"));
const TvCorporativaAdmin = lazyWithRetry(() => import("@/pages/TvCorporativaAdmin"));
const TvPlayer = lazyWithRetry(() => import("@/pages/TvPlayer"));
const TvTimelineEditor = lazyWithRetry(() => import("@/pages/TvTimelineEditor"));
const PublicEntityTvUpload = lazyWithRetry(() => import("@/pages/PublicEntityTvUpload"));
const Inventory = lazyWithRetry(() => import("@/pages/Inventory"));
const InventoryDetail = lazyWithRetry(() => import("@/pages/InventoryDetail"));
const LinkManager = lazyWithRetry(() => import("@/pages/LinkManager"));
const PublicLinks = lazyWithRetry(() => import("@/pages/PublicLinks"));
const PortalManager = lazyWithRetry(() => import("@/pages/PortalManager"));
const PortalEditor = lazyWithRetry(() => import("@/pages/PortalEditor"));
const PublicPortal = lazyWithRetry(() => import("@/pages/PublicPortal"));
const MediaKitList = lazyWithRetry(() => import("@/pages/MediaKitList"));
const MediaKitTemplates = lazyWithRetry(() => import("@/pages/MediaKitTemplates"));
const MediaKitMasks = lazyWithRetry(() => import("@/pages/MediaKitMasks"));
const MediaKitEditor = lazyWithRetry(() => import("@/pages/MediaKitEditor"));
const Communication = lazyWithRetry(() => import("@/pages/Communication"));
const PublicScriptApproval = lazyWithRetry(() => import("@/pages/PublicScriptApproval"));
const MktTechaPublicApproval = lazyWithRetry(() => import("@/pages/MktTechaPublicApproval"));
const MktTechaPublicSummary = lazyWithRetry(() => import("@/pages/MktTechaPublicSummary"));
const MktTechaPublicReport = lazyWithRetry(() => import("@/pages/MktTechaPublicReport"));
const SuperTasks = lazyWithRetry(() => import("@/pages/SuperTasks"));
const Processes = lazyWithRetry(() => import("@/pages/Processes"));



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
  <GlobalErrorBoundary>
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

                  {/* M30 Public Script Approval (no auth) */}
                  <Route path="/public/m30/approve/:token" element={<PublicScriptApproval />} />

                  {/* MKT Techa Public Approval & Summary (no auth) */}
                  <Route path="/public/mkt-techa/approve/:id" element={<MktTechaPublicApproval />} />
                  <Route path="/public/mkt-techa/summary/:id" element={<MktTechaPublicSummary />} />
                  <Route path="/public/mkt-techa/report/:id" element={<MktTechaPublicReport />} />

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
                    path="/app/orders"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <Orders />
                      </RequireRouteAccess>
                    }
                  />

                  <Route
                    path="/app/operacao-m30"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <OperacaoM30 />
                      </RequireRouteAccess>
                    }
                  />

                  <Route
                    path="/app/mkt-techa"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <MktTecha />
                      </RequireRouteAccess>
                    }
                  />


                  <Route
                    path="/app/communication"
                    element={
                      <RequireCommunicationEnabled>
                        <RequireRouteAccess routeKey="app.communication">
                          <Communication />
                        </RequireRouteAccess>
                      </RequireCommunicationEnabled>
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
                    path="/app/contracts"
                    element={
                      <RequireRouteAccess routeKey="app.contracts">
                        <Contracts />
                      </RequireRouteAccess>
                    }
                  />
                  <Route
                    path="/app/commitments/:id"
                    element={
                      <RequireRouteAccess routeKey="app.commitment_detail">
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
                    path="/app/media-kit"
                    element={
                      <RequireRouteAccess routeKey="app.media_kit">
                        <MediaKitList />
                      </RequireRouteAccess>
                    }
                  />
                  <Route
                    path="/app/media-kit/templates"
                    element={
                      <RequireRouteAccess routeKey="app.media_kit">
                        <MediaKitTemplates />
                      </RequireRouteAccess>
                    }
                  />
                  <Route
                    path="/app/media-kit/masks"
                    element={
                      <RequireRouteAccess routeKey="app.media_kit">
                        <MediaKitMasks />
                      </RequireRouteAccess>
                    }
                  />
                  <Route
                    path="/app/media-kit/editor/:id"
                    element={
                      <RequireRouteAccess routeKey="app.media_kit">
                        <MediaKitEditor />
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
                    path="/app/super-tasks"
                    element={
                      <RequireRouteAccess routeKey="app.super_tasks">
                        <SuperTasks />
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
                    path="/app/processes"
                    element={
                      <RequireProcessesEnabled>
                        <RequireRouteAccess routeKey="app.processes">
                          <Processes />
                        </RequireRouteAccess>
                      </RequireProcessesEnabled>
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
                    path="/app/operacao-m30/:id"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <OperacaoM30Case />
                      </RequireRouteAccess>
                    }
                  />

                  <Route
                    path="/app/mkt-techa/:id"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <MktTechaCase />
                      </RequireRouteAccess>
                    }
                  />

                  <Route
                    path="/app/orders/:id"
                    element={
                      <RequireRouteAccess routeKey="app.dashboard">
                        <SalesOrderCase />
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
  </GlobalErrorBoundary>
);

export default App;