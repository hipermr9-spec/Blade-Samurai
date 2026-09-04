-- Run in the Supabase SQL editor.
-- The quoted "user-id" names match the existing schema.

insert into storage.buckets (id, name, public)
values ('profiles', 'profiles', true)
on conflict (id) do update set public = true;

alter table public.users
  add column if not exists email text,
  add column if not exists profile_image text,
  add column if not exists last_seen timestamp with time zone;

alter table public.users alter column verified set default false;
alter table public.users alter column admin set default false;
alter table public.users alter column developer set default false;

alter table public.chat
  add constraint chat_user_fk foreign key ("user-id") references public.users ("user-id") on delete cascade;

create index if not exists chat_created_at_idx on public.chat (created_at);
create index if not exists users_last_seen_idx on public.users (last_seen);
create unique index if not exists users_email_unique_idx on public.users (lower(email)) where email is not null;

-- Promote the first administrator manually after creating the account:
-- update public.users set admin = true where username = 'your_username';
