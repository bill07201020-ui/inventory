-- =============================================================
-- 齒模假牙進度追蹤系統 — schema.sql
-- 一次跑完：資料表、RLS、觸發器、patient_track 函式、Storage bucket
-- 在 Supabase SQL Editor 貼上執行。
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- 列舉：角色 / 案件階段
-- -------------------------------------------------------------
do $$ begin
  create type org_role as enum ('clinic', 'lab', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 假牙製作工作流：收件 → 設計 → 製作/研磨 → 完成 → 送達
  create type case_stage as enum ('received', 'design', 'fabrication', 'finishing', 'delivered');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- 機構（診所 / 技工所）
-- -------------------------------------------------------------
create table if not exists public.orgs (
  org_id     uuid primary key default gen_random_uuid(),
  name       text not null,
  org_type   org_role not null default 'clinic',
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 使用者 profile（對應 auth.users）
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references public.orgs(org_id) on delete set null,
  role       org_role not null default 'clinic',
  full_name  text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 案件
-- phone_last4 為查詢用（不存完整電話於可被查詢路徑；完整電話僅供內部）
-- -------------------------------------------------------------
create table if not exists public.cases (
  case_id       uuid primary key default gen_random_uuid(),
  patient_name  text not null,
  patient_phone text,                         -- 完整電話，僅內部 RLS 可見
  phone_last4   text generated always as (right(coalesce(patient_phone, ''), 4)) stored,
  item_type     text,                         -- 假牙類型（全口 / 局部 / 單顆冠 …）
  stage         case_stage not null default 'received',
  clinic_org_id uuid references public.orgs(org_id) on delete set null,
  lab_org_id    uuid references public.orgs(org_id) on delete set null,
  note          text,
  received_at   timestamptz default now(),
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists cases_name_last4_idx on public.cases (patient_name, phone_last4);

-- -------------------------------------------------------------
-- 案件照片（每個階段可多張）
-- -------------------------------------------------------------
create table if not exists public.case_photos (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(case_id) on delete cascade,
  stage       case_stage not null,
  photo_path  text not null,                  -- storage path，非公開 URL
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists case_photos_case_idx on public.case_photos (case_id, created_at desc);

-- -------------------------------------------------------------
-- 階段異動紀錄（由觸發器自動寫入）
-- -------------------------------------------------------------
create table if not exists public.case_status_log (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(case_id) on delete cascade,
  stage      case_stage not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists case_status_log_case_idx on public.case_status_log (case_id, changed_at desc);

-- -------------------------------------------------------------
-- 限流（病患查詢用，小量替代 Redis）
-- -------------------------------------------------------------
create table if not exists public.rate_limit (
  ip          text not null,
  window_start timestamptz not null,
  count       int not null default 0,
  primary key (ip, window_start)
);

-- 原子遞增限流計數，回傳該窗目前次數（後端 service_role 呼叫）
create or replace function public.bump_rate_limit(p_ip text, p_window timestamptz)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit (ip, window_start, count)
  values (p_ip, p_window, 1)
  on conflict (ip, window_start)
  do update set count = public.rate_limit.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- =============================================================
-- 觸發器
-- =============================================================

-- (1) 階段變更 → 寫 log，並維護 received_at / delivered_at
create or replace function public.on_case_stage_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.case_status_log (case_id, stage, changed_by)
    values (new.case_id, new.stage, auth.uid());

    if new.stage = 'received' and new.received_at is null then
      new.received_at := now();
    end if;

    if new.stage = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_case_stage_change on public.cases;
create trigger trg_case_stage_change
  before insert or update of stage on public.cases
  for each row execute function public.on_case_stage_change();

-- (2) auth.users 新增 → 自動建 profile（org 由 admin 後續指派）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- 病患查詢函式（SECURITY DEFINER：繞過 RLS，只回傳安全欄位）
-- 以「姓名 + 電話末四碼」比對，回傳目前階段與送達照 storage path。
-- =============================================================
create or replace function public.patient_track(p_name text, p_phone_last4 text)
returns table (
  case_id         uuid,
  patient_name    text,
  item_type       text,
  stage           case_stage,
  received_at     timestamptz,
  delivered_at    timestamptz,
  delivered_photo text
)
language sql
security definer
set search_path = public
as $$
  select
    c.case_id,
    c.patient_name,
    c.item_type,
    c.stage,
    c.received_at,
    c.delivered_at,
    (
      select p.photo_path
      from public.case_photos p
      where p.case_id = c.case_id and p.stage = 'delivered'
      order by p.created_at desc
      limit 1
    ) as delivered_photo
  from public.cases c
  where c.patient_name = btrim(p_name)
    and c.phone_last4 = p_phone_last4;
$$;

grant execute on function public.patient_track(text, text) to anon, authenticated;

-- =============================================================
-- RLS
-- =============================================================
alter table public.orgs            enable row level security;
alter table public.profiles        enable row level security;
alter table public.cases           enable row level security;
alter table public.case_photos     enable row level security;
alter table public.case_status_log enable row level security;
alter table public.rate_limit      enable row level security;

-- helper：目前使用者的 org / role
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns org_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles：本人可讀寫自己；admin 可讀全部
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid() or public.current_role() = 'admin');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- orgs：登入者可讀；admin 可寫
drop policy if exists orgs_read on public.orgs;
create policy orgs_read on public.orgs
  for select to authenticated using (true);

drop policy if exists orgs_admin_write on public.orgs;
create policy orgs_admin_write on public.orgs
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- cases：同機構（診所或技工所）成員可讀寫；admin 全權
drop policy if exists cases_member_select on public.cases;
create policy cases_member_select on public.cases
  for select to authenticated using (
    public.current_role() = 'admin'
    or clinic_org_id = public.current_org_id()
    or lab_org_id = public.current_org_id()
  );

drop policy if exists cases_member_write on public.cases;
create policy cases_member_write on public.cases
  for all to authenticated using (
    public.current_role() = 'admin'
    or clinic_org_id = public.current_org_id()
    or lab_org_id = public.current_org_id()
  ) with check (
    public.current_role() = 'admin'
    or clinic_org_id = public.current_org_id()
    or lab_org_id = public.current_org_id()
  );

-- case_photos：依案件所屬機構
drop policy if exists case_photos_member on public.case_photos;
create policy case_photos_member on public.case_photos
  for all to authenticated using (
    exists (
      select 1 from public.cases c
      where c.case_id = case_photos.case_id and (
        public.current_role() = 'admin'
        or c.clinic_org_id = public.current_org_id()
        or c.lab_org_id = public.current_org_id()
      )
    )
  ) with check (
    exists (
      select 1 from public.cases c
      where c.case_id = case_photos.case_id and (
        public.current_role() = 'admin'
        or c.clinic_org_id = public.current_org_id()
        or c.lab_org_id = public.current_org_id()
      )
    )
  );

-- case_status_log：依案件所屬機構（讀）
drop policy if exists case_status_log_member on public.case_status_log;
create policy case_status_log_member on public.case_status_log
  for select to authenticated using (
    exists (
      select 1 from public.cases c
      where c.case_id = case_status_log.case_id and (
        public.current_role() = 'admin'
        or c.clinic_org_id = public.current_org_id()
        or c.lab_org_id = public.current_org_id()
      )
    )
  );

-- rate_limit：僅 service_role（後端）可存取；不開放 anon/authenticated
-- （RLS enabled 且無 policy → 一般使用者全部拒絕，service_role 會繞過 RLS）

-- =============================================================
-- Storage：private bucket case-photos
-- =============================================================
insert into storage.buckets (id, name, public)
values ('case-photos', 'case-photos', false)
on conflict (id) do nothing;

-- 登入者可對自己機構案件的資料夾上傳/讀取（path 慣例：<case_id>/<stage>/<file>）
drop policy if exists case_photos_storage_member on storage.objects;
create policy case_photos_storage_member on storage.objects
  for all to authenticated
  using (
    bucket_id = 'case-photos'
    and exists (
      select 1 from public.cases c
      where c.case_id = ((storage.foldername(name))[1])::uuid and (
        public.current_role() = 'admin'
        or c.clinic_org_id = public.current_org_id()
        or c.lab_org_id = public.current_org_id()
      )
    )
  )
  with check (
    bucket_id = 'case-photos'
    and exists (
      select 1 from public.cases c
      where c.case_id = ((storage.foldername(name))[1])::uuid and (
        public.current_role() = 'admin'
        or c.clinic_org_id = public.current_org_id()
        or c.lab_org_id = public.current_org_id()
      )
    )
  );

-- 病患送達照不開放 anon 直讀；一律由後端 service_role 產生 signed URL。
