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

  update public.generation_usage
  set status='failed', updated_at=now()
  where user_id=auth.uid()
    and status='reserved'
    and created_at < now() - interval '30 minutes';

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

    if p_kind='image' and succeeded_images + reserved_images >= 1 then
      raise exception 'free_image_consumed';
    end if;

    if p_kind='video' then
      if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 8 then
        raise exception 'invalid_video_duration';
      end if;
      if succeeded_video_seconds + reserved_video_seconds + p_duration_seconds > 8 then
        raise exception 'free_video_consumed';
      end if;
    end if;
  end if;

  insert into public.generation_usage(user_id,campaign_id,kind,duration_seconds,provider,model,estimated_cost_usd,status)
  values(auth.uid(),p_campaign_id,p_kind,p_duration_seconds,p_provider,p_model,p_estimated_cost_usd,'reserved')
  returning * into r;
  return r;
end;
$$;

revoke all on function public.reserve_generation(uuid,text,integer,text,text,numeric) from public, anon;
grant execute on function public.reserve_generation(uuid,text,integer,text,text,numeric) to authenticated;
