alter table public.plans enable row level security;

create policy "Plans are viewable by everyone"
  on public.plans
  for select
  using (true);
