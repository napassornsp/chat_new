-- Create plans table with monthly credits per bot version
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_cents integer,
  credits_v1 integer,
  credits_v2 integer,
  credits_v3 integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to auto-update updated_at
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_plans_updated_at
before update on public.plans
for each row execute function public.update_updated_at_column();

-- Seed plans (upsert by name)
insert into public.plans (name, price_cents, credits_v1, credits_v2, credits_v3)
values
  ('Free',    0,    5, 10, 15),
  ('Pro',     1500, 10, 20, 30),
  ('Premium', 3000, 20, 30, 40),
  ('Business', null, null, null, null)
on conflict (name) do update set
  price_cents = excluded.price_cents,
  credits_v1 = excluded.credits_v1,
  credits_v2 = excluded.credits_v2,
  credits_v3 = excluded.credits_v3,
  updated_at = now();

-- Link profiles to plans
alter table public.profiles
  add column if not exists plan_id uuid references public.plans(id);

-- Default existing users to Free plan
update public.profiles p
set plan_id = (select id from public.plans where name = 'Free')
where plan_id is null;

-- Ensure handle_new_user assigns Free plan
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.profiles (id, email, plan_id)
  values (new.id, new.email, (select id from public.plans where name = 'Free'));

  insert into public.user_credits (user_id)
  values (new.id);

  return new;
end;
$func$;

-- Track last monthly reset of credits
alter table public.user_credits
  add column if not exists last_reset_month date not null default (date_trunc('month', now()))::date;

-- Function to reset credits at the start of each calendar month based on plan
create or replace function public.reset_monthly_credits()
returns table (v1 integer, v2 integer, v3 integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid;
  current_month date := (date_trunc('month', now()))::date;
  p_rec record;
  uc_rec record;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into uc_rec from public.user_credits where user_id = uid;

  -- Fetch plan credits (can be null for Business/custom plans)
  select p.credits_v1, p.credits_v2, p.credits_v3
    into p_rec
  from public.profiles pr
  join public.plans p on p.id = pr.plan_id
  where pr.id = uid;

  if uc_rec is null then
    insert into public.user_credits (user_id, v1, v2, v3, last_reset_month)
    values (
      uid,
      coalesce(p_rec.credits_v1, 10),
      coalesce(p_rec.credits_v2, 20),
      coalesce(p_rec.credits_v3, 30),
      current_month
    );
  elsif uc_rec.last_reset_month <> current_month then
    update public.user_credits
    set
      v1 = coalesce(p_rec.credits_v1, v1),
      v2 = coalesce(p_rec.credits_v2, v2),
      v3 = coalesce(p_rec.credits_v3, v3),
      last_reset_month = current_month,
      updated_at = now()
    where user_id = uid;
  end if;

  return query select v1, v2, v3 from public.user_credits where user_id = uid;
end;
$fn$;
