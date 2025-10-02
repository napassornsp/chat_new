-- Create core tables for chat app with RLS and triggers

-- Enable pgcrypto for gen_random_uuid if not already
create extension if not exists pgcrypto;

-- profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- user_credits table
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users on delete cascade,
  v1 integer not null default 10,
  v2 integer not null default 20,
  v3 integer not null default 30,
  updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

create policy "Users can view their own credits" on public.user_credits for select using (auth.uid() = user_id);
create policy "Users can insert their own credits" on public.user_credits for insert with check (auth.uid() = user_id);
create policy "Users can update their own credits" on public.user_credits for update using (auth.uid() = user_id);

-- chats table
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chats enable row level security;

create policy "Users can view their own chats" on public.chats for select using (auth.uid() = user_id);
create policy "Users can insert their own chats" on public.chats for insert with check (auth.uid() = user_id);
create policy "Users can update their own chats" on public.chats for update using (auth.uid() = user_id);
create policy "Users can delete their own chats" on public.chats for delete using (auth.uid() = user_id);

-- messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can view messages in their chats" on public.messages for select using (
  exists (
    select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()
  )
);

create policy "Users can insert messages into their chats" on public.messages for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()
  )
);

create policy "Users can update their messages" on public.messages for update using (
  user_id = auth.uid() and exists (
    select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()
  )
);

create policy "Users can delete messages in their chats" on public.messages for delete using (
  exists (
    select 1 from public.chats c where c.id = chat_id and c.user_id = auth.uid()
  )
);

-- Update timestamp trigger function
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- triggers for updated_at
create or replace trigger trg_chats_updated_at before update on public.chats
for each row execute function public.update_updated_at_column();

create or replace trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.update_updated_at_column();

create or replace trigger trg_user_credits_updated_at before update on public.user_credits
for each row execute function public.update_updated_at_column();

-- Handle new user signup: create profile and default credits
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.user_credits (user_id)
  values (new.id);

  return new;
end;
$$;

-- trigger on auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- helpful indexes
create index if not exists idx_chats_user on public.chats(user_id, updated_at desc);
create index if not exists idx_messages_chat on public.messages(chat_id, created_at asc);
