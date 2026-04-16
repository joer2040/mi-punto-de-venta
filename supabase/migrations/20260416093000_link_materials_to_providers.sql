begin;

alter table public.materials
  add column if not exists provider_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_provider_id_fkey'
  ) then
    alter table public.materials
      add constraint materials_provider_id_fkey
      foreign key (provider_id) references public.providers(id);
  end if;
end $$;

create index if not exists materials_provider_id_idx
  on public.materials(provider_id);

commit;
