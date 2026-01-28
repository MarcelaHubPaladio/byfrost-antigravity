# byfrost-ia

Byfrost.ia é o **“Guardião do Negócio”**: captura pedidos via WhatsApp (Z-API), executa OCR (Google Vision), gera pendências, registra decisões explicáveis (WHY) e mantém **governança** (IA não altera status / não aprova / não dispara cliente sem humano).

Este repositório contém:
- **Frontend**: Vite + React + TypeScript + Tailwind
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions em Deno)
- **Observabilidade**: timeline + decision logs + audit ledger com hash encadeado
- **Multi-tenant**: isolamento estrito por tenant (RLS)

> MVP entregue: Jornada **Vendas + Gestão de Pedido** (pedido por foto via WhatsApp).

---

## 1) Setup (visão geral)

### Frontend
1. Copie `.env.example` para `.env.local`.
2. Preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_SUPER_ADMIN_EMAILS` (lista separada por vírgula)

### Supabase (DB + migrations)
As migrations ficam em `supabase/migrations/`.

Tabelas principais (MVP):
- Tenancy/planos: `tenants`, `users_profile`, ...
- WhatsApp: `wa_instances`, `wa_messages`, `wa_contacts`
- Casos: `cases`, `case_fields`, `case_attachments`
- Pendências: `pendencies`
- Observabilidade: `timeline_events`, `decision_logs`, `audit_ledger`
- Jobs: `job_queue`
- RAG: `kb_documents`, `kb_chunks (pgvector)`

### Edge Functions (Secrets)
Configure Secrets no Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_VISION_API_KEY` (para OCR e paleta)
- `ZAPI_BASE_URL` (opcional: se vazio, o sistema só registra outbox)
- `AI_PROVIDER`, `AI_API_KEY`, `EMBEDDINGS_MODEL` (para embeddings em RAG)

---

## 2) Multi-tenant + RLS

- **RLS está habilitado em todas as tabelas tenant-facing.**
- Usuários autenticados só veem dados do seu tenant via `users_profile`.
- Existe uma função opcional `current_tenant_id()` para cenários com claim no JWT, mas o MVP usa o vínculo por `users_profile`.

---

## 3) Fluxo MVP (Pedido por foto)

### Entrada (imagem)
Um inbound de imagem cria:
- `cases` (state `awaiting_ocr`)
- `case_attachments` (imagem)
- pendências iniciais (`need_location`, `need_more_pages`)
- `timeline_events` + `decision_logs` + `audit_ledger`
- jobs na fila (`job_queue`) para OCR/validação

### Localização
Ao receber localização:
- salva `case_fields.location`
- resolve pendência `need_location`
- move o caso para `ready_for_review`

### Painel
- Dashboard (board por estados)
- Detalhe do caso: imagem, campos com confiança, pendências, timeline, decision logs (WHY)
- Ação humana: **Aprovar e preparar mensagem** ao cliente (governança)

---

## 4) Endpoints (Edge Functions)

> Base: `https://<PROJECT_ID>.supabase.co/functions/v1/<FUNCTION_NAME>`

### Webhook Z-API (inbound)
`/webhooks-zapi-inbound`
- Header ou query: `x-webhook-secret` ou `?secret=`
- Procura `wa_instances.zapi_instance_id` e valida `webhook_secret`

### Processador de jobs
`/jobs-processor`
- Processa `job_queue` (OCR_IMAGE, EXTRACT_FIELDS, VALIDATE_FIELDS, ASK_PENDENCIES)

### Envio Z-API (outbound)
`/integrations-zapi-send`
- Sempre grava `wa_messages` outbound.
- Se `ZAPI_BASE_URL` estiver configurado, tenta chamada externa best-effort.

### OCR Google Vision (HTTP)
`/integrations-google-vision-ocr`
- Entrada: `{ imageUrl }` ou `{ imageBase64 }`

### Simulador de WhatsApp
`/simulator-whatsapp`
- Executa fluxo similar ao inbound, sem Z-API.
- Retorna `outbox preview`.

### Branding: extrair paleta
`/branding-extract-palette`
- Usa Google Vision `IMAGE_PROPERTIES`.
- Entrada: `{ tenantId, logoUrl }` ou `{ tenantId, bucket, path }`
- Salva em `tenants.branding_json.palette`.

### KB / RAG: ingestão
`/kb-ingest`
- Entrada: `{ tenantId, title, text, journeyId?, source?, storagePath? }`
- Chunka e salva em `kb_chunks` com embeddings por tenant.

### Cron runner (agendável)
`/cron-runner`
- Invoca `jobs-processor` (best-effort)
- Escalona pendências vencidas (SLA) para líder via `alerts` + outbox

---

## 5) Como configurar o MVP rapidamente

### 5.1 Criar tenant e vínculo do usuário (SQL)
1. Crie um tenant.
2. Vincule seu usuário no `users_profile` (seu user_id vem de `auth.users`).
3. Crie uma instância WhatsApp (`wa_instances`) com `zapi_instance_id` e `webhook_secret`.

### 5.2 Simular (sem Z-API)
No painel:
- Entre com Google.
- Selecione o tenant.
- Vá em **Simulador** e envie um payload de imagem (URL pública).
- Depois, envie localização.

---

## 6) Critérios de aceite (mínimos)

1. Inbound de imagem cria case e pendências (OK: `webhooks-zapi-inbound` / `simulator-whatsapp`).
2. Inbound de localização resolve pendência e libera revisão (OK).
3. Painel exibe imagem, campos com confiança, timeline e decision_logs (OK).
4. Aprovação humana prepara envio ao cliente via `integrations-zapi-send` (OK).
5. Simulador roda o mesmo fluxo sem Z-API (OK).
6. RLS impede vazamento cross-tenant (OK — via `users_profile`).
7. `audit_ledger` gravado com hash encadeado (OK — via `append_audit_ledger`).

---

## 7) Notas importantes de governança

- A IA **não altera status** e **não aprova/reprova**.
- Mensagens ao cliente só saem após ação humana e respeitam toggle do tenant (`tenants.branding_json.features.notify_customer`).

---

## 8) Estrutura

- `src/` — app React
- `supabase/migrations/` — schema + RLS
- `supabase/functions/` — Edge Functions (Deno)
