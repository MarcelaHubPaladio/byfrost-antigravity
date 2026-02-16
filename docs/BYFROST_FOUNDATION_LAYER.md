# BYFROST — Foundation Layer (padrões arquiteturais)

Este documento consolida os padrões observados nas migrations atuais e define um **padrão único** para todas as **novas** tabelas (Core Entities, Commercial Commitments, Deliverables, Capacity Engine), **sem alterar estruturas existentes**.

## 0) Não-negociáveis (escopo)
- Não recriar tabelas existentes.
- Não alterar jornadas (journeys), RBAC, tenants.
- Não criar UI/rotas/componentes.

## 1) Padrões globais identificados (estado atual)

### 1.1 Multi-tenant (`tenant_id`)
- **Padrão predominante:** tabelas tenant-facing possuem `tenant_id uuid not null references public.tenants(id) on delete cascade`.
- **Exceções intencionais (tabelas “template” / catálogo global):** `sectors`, `journeys`, `roles`, `agents`, `prompt_templates` não têm `tenant_id`.
- Índices/uniques frequentemente incluem `tenant_id` (ex.: `unique(tenant_id, ...)`).

### 1.2 Auditoria / Observabilidade
- Há dois eixos principais:
  - **`timeline_events`**: log de eventos do domínio (case-centric).
  - **`audit_ledger` + `append_audit_ledger()`**: trilha imutável com hash-chain por tenant.
- Também existem logs específicos (ex.: `decision_logs`).

### 1.3 Soft delete
- Padrão predominante: `deleted_at timestamptz`.
- Consultas/uniques importantes usam `where deleted_at is null` (ex.: índices parciais para casos de presença e dedupe).
- Observação: nem todas as tabelas “novas” (ex.: finance) carregam soft delete. Isso cria inconsistência.

### 1.4 Timestamps
- Padrão predominante (inicial):
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Algumas tabelas posteriores adotam somente `created_at` (tabelas que tratam o registro como append-only/imutável ou por simplificação).

### 1.5 Triggers
- Existem **duas funções equivalentes** usadas por migrations diferentes:
  - `public.touch_updated_at()` (schema inicial)
  - `public.set_updated_at()` (presence/content)
- Padrão: trigger `BEFORE UPDATE` para sempre setar `updated_at = now()`.

### 1.6 RLS (Row Level Security)
- Padrão predominante: `alter table ... enable row level security;`
- Políticas mais comuns em tabelas tenant-facing:
  - `using (public.has_tenant_access(tenant_id))`
  - `with check (public.has_tenant_access(tenant_id))`
- Existem políticas específicas de contexto (ex.: `is_presence_manager`, `current_tenant_id`, `is_panel_user`).
- Importante: **não** alterar políticas existentes (apenas padronizar para novas tabelas).

## 2) Padrão único para NOVAS tabelas (Core/Commitments/Deliverables/Capacity)

### 2.1 Classificação obrigatória da tabela
Antes de criar qualquer tabela nova, classificar como:
1. **Tenant-facing (padrão Core):** possui `tenant_id` e RLS por tenant.
2. **Global template/catalog:** não possui `tenant_id`, leitura ampla e escrita super-admin.
3. **Ledger/append-only:** preferir imutabilidade (sem updates/deletes) e/ou auditoria explícita.

### 2.2 Colunas padrão (Tenant-facing)
**Obrigatórias** (salvo justificativa explícita):
- `id uuid primary key default gen_random_uuid()`
- `tenant_id uuid not null references public.tenants(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz` (**soft delete padrão do Core**)

**Recomendadas** (quando fizer sentido):
- `created_by uuid references auth.users(id) on delete set null`
- `meta_json jsonb not null default '{}'::jsonb` (ou `metadata`/`config_json` conforme domínio)

### 2.3 Chaves/Constraints/Índices
- **Tudo que for único por tenant deve incluir `tenant_id`**:
  - `unique (tenant_id, external_id)`
  - `unique (tenant_id, code)`
- **Índices usuais**:
  - `create index ... on <table>(tenant_id, created_at desc)`
  - para buscas frequentes: `(tenant_id, <status>, updated_at desc)`

### 2.4 Integridade referencial cross-tenant (regra forte)
Sempre que uma tabela tenant-facing referencia outra tenant-facing, **preferir FK composta** para garantir “mesmo tenant” no nível do banco:
- Exemplo de padrão:
  - Colunas: `tenant_id`, `parent_id`
  - FK: `foreign key (tenant_id, parent_id) references parent_table(tenant_id, id)`

Isso evita referências cruzadas mesmo em caso de bug de aplicação.

### 2.5 Soft delete (regra)
- Soft delete é o padrão do Core: `deleted_at`.
- Evitar `DELETE` como operação normal; preferir update em `deleted_at`.
- Índices únicos que precisam ignorar soft-deleted devem usar índice parcial (`where deleted_at is null`).

### 2.6 updated_at (regra)
- `updated_at` deve ser **sempre server-generated** via trigger `BEFORE UPDATE`.
- Novo padrão canônico: `public.byfrost_set_updated_at()`.

### 2.7 RLS (regra)
Para novas tabelas tenant-facing:
- `ENABLE ROW LEVEL SECURITY`.
- Políticas padrão:
  - select: `using (public.has_tenant_access(tenant_id))`
  - insert: `with check (public.has_tenant_access(tenant_id))`
  - update: `using (...) with check (...)`
- Delete (hard delete): **evitar**; se existir, restringir conforme necessidade do módulo.

## 3) Helpers reutilizáveis (base pronta)
Foi adicionada uma migration de fundação com helpers reutilizáveis (sem criar tabelas):
- `public.byfrost_set_updated_at()` (canônica)
- Compatibilidade: `public.touch_updated_at()` e `public.set_updated_at()` (mesmo comportamento)
- `public.byfrost_ensure_updated_at_trigger(regclass, text)`
- `public.byfrost_enable_rls(regclass)`
- `public.byfrost_ensure_tenant_policies(regclass, name)`

Esses helpers serão usados nas próximas fases para criar as novas tabelas **seguindo um único padrão**, sem tocar em RBAC/journeys/tenants existentes.

## 4) Estratégia validada (para a próxima fase)
Quando começarmos Core Entities / Commitments / Deliverables / Capacity:
1. Definir cada tabela como **tenant-facing** ou **catalog**.
2. Criar tabela com colunas padrão (incluindo `deleted_at`).
3. Criar FKs compostas `(tenant_id, <ref_id>)` quando referenciar outras tabelas tenant-facing.
4. Aplicar:
   - `byfrost_enable_rls(<table>)`
   - `byfrost_ensure_tenant_policies(<table>)`
   - `byfrost_ensure_updated_at_trigger(<table>)`
5. Criar índices mínimos guiados por queries reais.

---

**Status:** Foundation layer definida e pronta para evoluir o Core, sem mudanças visuais e sem alterar estruturas existentes.
