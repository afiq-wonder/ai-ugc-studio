create table if not exists public.generation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null check (kind in ('image','video')),
  provider text,
  model text,
  units integer not null default 1 check (units > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  estimated_cost_usd numeric(10,4),
  status text not null default 'reserved' check (status in ('reserved','succeeded','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_usage_user_created_idx on public.generation_usage(user_id, created_at desc);
create index if not exists generation_usage_campaign_idx on public.generation_usage(campaign_id);

alter table public.generation_usage enable row level security;

create policy "users_can_read_own_generation_usage"
on public.generation_usage for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.my_generation_entitlement()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with p as (
    select coalesce((select plan from public.profiles where user_id = auth.uid()), 'free') as plan
  ), u as (
    select
      count(*) filter (where kind='image' and status='succeeded')::int as images_used,
      coalesce(sum(duration_seconds) filter (where kind='video' and status='succeeded'),0)::int as video_seconds_used
    from public.generation_usage
    where user_id = auth.uid()
  )
  select jsonb_build_object(
    'plan', p.plan,
    'free_image_limit', case when p.plan='free' then 1 else null end,
    'free_video_seconds_limit', case when p.plan='free' then 8 else null end,
    'images_used', u.images_used,
    'video_seconds_used', u.video_seconds_used,
    'image_available', case when p.plan='free' then u.images_used < 1 else true end,
    'video_seconds_available', case when p.plan='free' then greatest(8-u.video_seconds_used,0) else null end
  ) from p,u;
$$;

create or replace function public.reserve_generation(
  p_campaign_id uuid,
  p_kind text,
  p_duration_seconds integer default null,
  p_provider text default null,
  p_model text default null,
  p_estimated_cost_usd numeric default null
)
returns public.generation_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.generation_usage;
  user_plan text;
  succeeded_images int;
  reserved_images int;
  succeeded_video_seconds int;
  reserved_video_seconds int;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_kind not in ('image','video') then raise exception 'invalid_generation_kind'; end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and user_id=auth.uid()) then raise exception 'campaign_not_found'; end if;

  insert into public.profiles(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select plan into user_plan from public.profiles where user_id=auth.uid();

  if user_plan='free' then
    select
      count(*) filter(where kind='image' and status='succeeded'),
      count(*) filter(where kind='image' and status='reserved'),
      coalesce(sum(duration_seconds) filter(where kind='video' and status='succeeded'),0),
      coalesce(sum(duration_seconds) filter(where kind='video' and status='reserved'),0)
    into succeeded_images,reserved_images,succeeded_video_seconds,reserved_video_seconds
    from public.generation_usage where user_id=auth.uid();

    if p_kind='image' and succeeded_images + reserved_images >= 1 then raise exception 'free_image_consumed'; end if;
    if p_kind='video' then
      if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 8 then raise exception 'invalid_video_duration'; end if;
      if succeeded_video_seconds + reserved_video_seconds + p_duration_seconds > 8 then raise exception 'free_video_consumed'; end if;
    end if;
  end if;

  insert into public.generation_usage(user_id,campaign_id,kind,duration_seconds,provider,model,estimated_cost_usd,status)
  values(auth.uid(),p_campaign_id,p_kind,p_duration_seconds,p_provider,p_model,p_estimated_cost_usd,'reserved')
  returning * into r;
  return r;
end;
$$;

create or replace function public.complete_generation(p_usage_id uuid, p_succeeded boolean)
returns public.generation_usage
language plpgsql
security definer
set search_path = public
as $$
declare r public.generation_usage;
begin
  update public.generation_usage
  set status=case when p_succeeded then 'succeeded' else 'failed' end, updated_at=now()
  where id=p_usage_id and user_id=auth.uid() and status='reserved'
  returning * into r;
  if r.id is null then raise exception 'generation_reservation_not_found'; end if;
  return r;
end;
$$;

revoke execute on function public.my_generation_entitlement() from public, anon;
revoke execute on function public.reserve_generation(uuid,text,integer,text,text,numeric) from public, anon;
revoke execute on function public.complete_generation(uuid,boolean) from public, anon;

grant execute on function public.my_generation_entitlement() to authenticated;
grant execute on function public.reserve_generation(uuid,text,integer,text,text,numeric) to authenticated;
grant execute on function public.complete_generation(uuid,boolean) to authenticated;
