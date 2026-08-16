-- ==========================================================
-- Event Post-Test & e-Certificate - Supabase schema
-- Jalankan di Supabase SQL Editor pada project yang digunakan.
-- ==========================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  event_name text not null,
  workshop_title text,
  organizer text,
  location text,
  event_date date,
  question_count integer not null default 20 check (question_count > 0),
  duration_minutes integer not null default 20 check (duration_minutes >= 0),
  passing_grade numeric(5,2) not null default 60 check (passing_grade between 0 and 100),
  randomize_questions boolean not null default true,
  randomize_options boolean not null default true,
  active boolean not null default false,
  certificate_title text not null default 'SERTIFIKAT PENGHARGAAN',
  recipient_label text not null default 'Diberikan Kepada',
  participant_role text not null default 'PESERTA',
  certificate_narrative text not null default 'Menyatakan bahwa yang bersangkutan telah mengikuti workshop "{WORKSHOP}" yang diselenggarakan oleh {ORGANIZER} di {LOCATION} pada tanggal {DATE}.',
  certificate_template_url text,
  certificate_layout jsonb,
  signer_name text,
  signer_position text,
  signature_url text,
  issue_certificate_on_submit boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  question_type text not null check (question_type in ('PG','TF','SHORT')),
  category text,
  question_text text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answers jsonb not null default '[]'::jsonb,
  weight numeric(8,2) not null default 1 check (weight > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  school text not null,
  class_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  question_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(5,2),
  correct_count integer,
  incorrect_count integer,
  status text not null default 'started' check (status in ('started','submitted'))
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer text,
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique(attempt_id, question_id)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  certificate_number text not null unique,
  verification_code text not null unique,
  issued_at timestamptz not null default now()
);

create table if not exists public.event_sequences (
  event_id uuid primary key references public.events(id) on delete cascade,
  next_certificate_no integer not null default 1
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.certificates enable row level security;
alter table public.event_sequences enable row level security;

drop policy if exists admin_profiles on public.profiles;
create policy admin_profiles on public.profiles for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select using (id = auth.uid());

drop policy if exists admin_events on public.events;
create policy admin_events on public.events for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_questions on public.questions;
create policy admin_questions on public.questions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_participants on public.participants;
create policy admin_participants on public.participants for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_attempts on public.attempts;
create policy admin_attempts on public.attempts for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_attempt_answers on public.attempt_answers;
create policy admin_attempt_answers on public.attempt_answers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_certificates on public.certificates;
create policy admin_certificates on public.certificates for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_event_sequences on public.event_sequences;
create policy admin_event_sequences on public.event_sequences for all using (public.is_admin()) with check (public.is_admin());

-- Hasil gabungan untuk dashboard admin
drop view if exists public.admin_results;
create view public.admin_results with (security_invoker=true) as
select
  p.event_id,
  p.id participant_id,
  p.name participant_name,
  p.school,
  p.class_name,
  p.email,
  p.phone,
  a.id attempt_id,
  a.score,
  a.correct_count,
  a.incorrect_count,
  a.started_at,
  a.submitted_at,
  c.certificate_number,
  c.verification_code
from public.participants p
left join public.attempts a on a.participant_id = p.id
left join public.certificates c on c.attempt_id = a.id;

revoke all on public.admin_results from anon, authenticated;
grant select on public.admin_results to authenticated;

-- Public RPC: ambil informasi event aktif tanpa membocorkan kunci jawaban
create or replace function public.get_event(p_event_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare e public.events;
begin
  select * into e from public.events
  where upper(event_code)=upper(trim(p_event_code)) and active=true;
  if not found then return null; end if;
  return jsonb_build_object(
    'id',e.id,'event_code',e.event_code,'event_name',e.event_name,
    'workshop_title',e.workshop_title,'organizer',e.organizer,'location',e.location,
    'event_date',e.event_date,'question_count',e.question_count,
    'duration_minutes',e.duration_minutes,'passing_grade',e.passing_grade,
    'randomize_questions',e.randomize_questions,'randomize_options',e.randomize_options
  );
end $$;

-- Public RPC: daftar peserta + pilih soal secara acak, tanpa correct_answers
create or replace function public.start_test(
  p_event_code text,
  p_name text,
  p_school text,
  p_class_name text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events;
  pid uuid;
  aid uuid;
  qids uuid[];
  qs jsonb;
begin
  if nullif(trim(p_name),'') is null or nullif(trim(p_school),'') is null then
    raise exception 'Nama dan asal sekolah wajib diisi';
  end if;
  select * into e from public.events where upper(event_code)=upper(trim(p_event_code)) and active=true;
  if not found then raise exception 'Event tidak ditemukan atau tidak aktif'; end if;

  insert into public.participants(event_id,name,school,class_name,email,phone)
  values(e.id,trim(p_name),trim(p_school),nullif(trim(p_class_name),''),nullif(trim(p_email),''),nullif(trim(p_phone),'')) returning id into pid;

  if e.randomize_questions then
    select array_agg(id) into qids from (
      select id from public.questions where event_id=e.id and active=true order by random() limit e.question_count
    ) s;
  else
    select array_agg(id) into qids from (
      select id from public.questions where event_id=e.id and active=true order by created_at,id limit e.question_count
    ) s;
  end if;
  if coalesce(array_length(qids,1),0)=0 then raise exception 'Bank soal event masih kosong'; end if;

  insert into public.attempts(event_id,participant_id,question_ids) values(e.id,pid,qids) returning id into aid;

  select jsonb_agg(jsonb_build_object(
    'id',q.id,'question_type',q.question_type,'category',q.category,
    'question_text',q.question_text,'options',q.options,'weight',q.weight
  ) order by x.ord)
  into qs
  from unnest(qids) with ordinality x(id,ord)
  join public.questions q on q.id=x.id;

  return jsonb_build_object('attempt_id',aid,'duration_minutes',e.duration_minutes,'questions',coalesce(qs,'[]'::jsonb));
end $$;

create or replace function public.submit_test(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.attempts;
  e public.events;
  p public.participants;
  q public.questions;
  qid uuid;
  answer_text text;
  ok boolean;
  correct_n integer:=0;
  total_n integer:=0;
  total_weight numeric:=0;
  correct_weight numeric:=0;
  seq_no integer;
  cert_no text;
  vcode text;
  cert public.certificates;
begin
  select * into a from public.attempts where id=p_attempt_id for update;
  if not found then raise exception 'Attempt tidak ditemukan'; end if;
  if a.status='submitted' then raise exception 'Post-test sudah pernah disubmit'; end if;
  select * into e from public.events where id=a.event_id;
  select * into p from public.participants where id=a.participant_id;

  foreach qid in array a.question_ids loop
    select * into q from public.questions where id=qid;
    total_n:=total_n+1; total_weight:=total_weight+q.weight;
    answer_text:=coalesce(p_answers->>q.id::text,'');
    if q.question_type='SHORT' then
      select exists(
        select 1 from jsonb_array_elements_text(q.correct_answers) ca
        where lower(trim(ca))=lower(trim(answer_text))
      ) into ok;
    else
      select exists(
        select 1 from jsonb_array_elements_text(q.correct_answers) ca
        where upper(trim(ca))=upper(trim(answer_text))
      ) into ok;
    end if;
    if ok then correct_n:=correct_n+1; correct_weight:=correct_weight+q.weight; end if;
    insert into public.attempt_answers(attempt_id,question_id,answer,is_correct)
    values(a.id,q.id,answer_text,ok)
    on conflict(attempt_id,question_id) do update set answer=excluded.answer,is_correct=excluded.is_correct;
  end loop;

  update public.attempts set submitted_at=now(),score=case when total_weight>0 then round((correct_weight/total_weight)*100,2) else 0 end,
    correct_count=correct_n,incorrect_count=total_n-correct_n,status='submitted' where id=a.id returning * into a;

  if e.issue_certificate_on_submit then
    insert into public.event_sequences(event_id,next_certificate_no) values(e.id,2)
    on conflict(event_id) do update set next_certificate_no=public.event_sequences.next_certificate_no+1
    returning next_certificate_no-1 into seq_no;
    cert_no := 'CERT-' || regexp_replace(upper(e.event_code),'[^A-Z0-9]+','','g') || '-' || to_char(coalesce(e.event_date,current_date),'YYYY') || '-' || lpad(seq_no::text,4,'0');
    vcode := encode(gen_random_bytes(12),'hex');
    insert into public.certificates(event_id,participant_id,attempt_id,certificate_number,verification_code)
    values(e.id,p.id,a.id,cert_no,vcode) returning * into cert;
  end if;

  return jsonb_build_object(
    'score',a.score,'correct_count',a.correct_count,'incorrect_count',a.incorrect_count,'total_questions',total_n,
    'passed',(a.score>=e.passing_grade),'participant_name',p.name,'school',p.school,
    'certificate_number',cert.certificate_number,'verification_code',cert.verification_code,
    'certificate_title',e.certificate_title,'recipient_label',e.recipient_label,'participant_role',e.participant_role,
    'certificate_narrative',e.certificate_narrative,'certificate_template_url',e.certificate_template_url,
    'certificate_layout',e.certificate_layout,'signer_name',e.signer_name,'signer_position',e.signer_position,
    'signature_url',e.signature_url,'workshop_title',coalesce(e.workshop_title,e.event_name),
    'organizer',e.organizer,'location',e.location,'event_date',e.event_date
  );
end $$;

create or replace function public.verify_certificate(p_verification_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select c.certificate_number,c.issued_at,p.name participant_name,p.school,e.workshop_title,e.event_name,e.organizer,e.location,e.event_date
  into r from public.certificates c
  join public.participants p on p.id=c.participant_id
  join public.events e on e.id=c.event_id
  where c.verification_code=p_verification_code;
  if not found then return null; end if;
  return jsonb_build_object('certificate_number',r.certificate_number,'issued_at',r.issued_at,'participant_name',r.participant_name,'school',r.school,
    'workshop_title',coalesce(r.workshop_title,r.event_name),'organizer',r.organizer,'location',r.location,'event_date',r.event_date);
end $$;

revoke all on function public.get_event(text) from public;
revoke all on function public.start_test(text,text,text,text,text,text) from public;
revoke all on function public.submit_test(uuid,jsonb) from public;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.get_event(text) to anon, authenticated;
grant execute on function public.start_test(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.submit_test(uuid,jsonb) to anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- Storage bucket untuk template dan tanda tangan
insert into storage.buckets(id,name,public)
values('certificate-assets','certificate-assets',true)
on conflict(id) do update set public=true;

drop policy if exists admin_certificate_assets_insert on storage.objects;
create policy admin_certificate_assets_insert on storage.objects for insert to authenticated
with check (bucket_id='certificate-assets' and public.is_admin());
drop policy if exists admin_certificate_assets_update on storage.objects;
create policy admin_certificate_assets_update on storage.objects for update to authenticated
using (bucket_id='certificate-assets' and public.is_admin()) with check (bucket_id='certificate-assets' and public.is_admin());
drop policy if exists admin_certificate_assets_delete on storage.objects;
create policy admin_certificate_assets_delete on storage.objects for delete to authenticated
using (bucket_id='certificate-assets' and public.is_admin());

-- Contoh setelah membuat user admin di Authentication > Users:
-- insert into public.profiles(id,role)
-- select id,'admin' from auth.users where email='admin@example.com'
-- on conflict(id) do update set role='admin';
