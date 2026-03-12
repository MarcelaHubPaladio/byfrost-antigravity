-- Add target_type to goal_templates and user_goals
alter table public.goal_templates add column if not exists target_type text not null default 'quantity';
alter table public.user_goals add column if not exists target_type text not null default 'quantity';

-- Comment explaining the types: 'quantity' for numeric counts, 'money' for monetary values
comment on column public.goal_templates.target_type is 'Type of goal: quantity (numeric count) or money (monetary value)';
comment on column public.user_goals.target_type is 'Type of goal: quantity (numeric count) or money (monetary value)';
