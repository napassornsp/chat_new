-- Enable RLS on plans and add read-only policy for everyone
alter table public.plans enable row level security;

-- Allow anyone (including anon) to view plans
create policy if not exists "Plans are viewable by everyone"
  on public.plans
  for select
  using (true);

-- Do NOT add insert/update/delete policies to keep it read-only via API