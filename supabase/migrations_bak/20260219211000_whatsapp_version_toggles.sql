-- Adiciona colunas de controle de versão à tabela wa_instances
alter table public.wa_instances add column if not exists enable_v1_business boolean not null default true;
alter table public.wa_instances add column if not exists enable_v2_audit boolean not null default true;

-- Comentários para documentação
comment on column public.wa_instances.enable_v1_business is 'Ativa/Desativa o processamento de regras de negócio legadas (V1).';
comment on column public.wa_instances.enable_v2_audit is 'Ativa/Desativa o log global de auditoria e conversas (V2).';
