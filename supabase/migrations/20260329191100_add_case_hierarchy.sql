-- Add parent hierarchy and subtask storage to cases
alter table public.cases add column if not exists parent_case_id uuid references public.cases(id) on delete cascade;

comment on column public.cases.parent_case_id is 'Allows grouping cases (e.g. production tasks under a planning case)';

-- Index for performance in hierarchy queries
create index if not exists cases_parent_case_id_idx on public.cases(parent_case_id);
