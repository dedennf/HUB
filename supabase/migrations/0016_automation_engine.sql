-- Fase 6 · Otomasi + Notifikasi (SPEC 8, 9).

-- Notifikasi: penunda jam tenang, kunci anti-duplikat (mis. pengingat H-1 tugas yang sama), kategori tambahan.
alter table public.notifications add column if not exists deliver_after timestamptz;
alter table public.notifications add column if not exists dedupe_key text;
-- unik biasa (bukan parsial) supaya bisa dipakai upsert on conflict. NULL tetap boleh banyak.
create unique index if not exists notifications_dedupe_uq on public.notifications (user_id, dedupe_key);
create index if not exists notifications_pending_idx on public.notifications (deliver_after) where sent_at is null;
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('briefing', 'recap', 'deadline', 'task', 'bill', 'budget', 'anomaly', 'english', 'research', 'automation'));

-- Otomasi bawaan dikenali lewat kunci tetap, satu per pengguna (SPEC 8.5).
alter table public.automations add column if not exists system_key text;
create unique index if not exists automations_system_uq on public.automations (user_id, system_key) where system_key is not null;

-- Lonceng di app ikut diperbarui lewat Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Peristiwa data (SPEC 8.2) dicatat ke antrean ringan, diproses /api/cron/tick.
create or replace function public.emit_automation_event() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.automation_events (user_id, event, payload)
  values (new.user_id, tg_argv[0], jsonb_build_object('id', new.id));
  return new;
end;
$$;

drop trigger if exists ev_transaction_created on public.transactions;
create trigger ev_transaction_created after insert on public.transactions
  for each row execute function public.emit_automation_event('transaction.created');
drop trigger if exists ev_task_created on public.tasks;
create trigger ev_task_created after insert on public.tasks
  for each row when (new.parent_id is null) execute function public.emit_automation_event('task.created');
drop trigger if exists ev_task_completed on public.tasks;
create trigger ev_task_completed after update of status on public.tasks
  for each row when (new.status = 'done' and old.status is distinct from 'done') execute function public.emit_automation_event('task.completed');
drop trigger if exists ev_research_progress on public.research_targets;
create trigger ev_research_progress after update of progress on public.research_targets
  for each row when (new.progress is distinct from old.progress) execute function public.emit_automation_event('research.progress_updated');
drop trigger if exists ev_vocab_created on public.vocab;
create trigger ev_vocab_created after insert on public.vocab
  for each row execute function public.emit_automation_event('vocab.created');
drop trigger if exists ev_bill_created on public.bills;
create trigger ev_bill_created after insert on public.bills
  for each row execute function public.emit_automation_event('bill.created');

-- Klaim aman dari eksekusi ganda (SPEC 8.3): baris dikunci "for update skip locked", lalu diberi sewa waktu
-- (next_run_at maju) atau ditandai diproses, sehingga dua tick yang berjalan bersamaan tidak mengambil baris yang sama.
create or replace function public.claim_due_automations(lease_seconds int default 600)
returns setof public.automations
language sql security invoker set search_path = public as $$
  update public.automations a
     set next_run_at = now() + make_interval(secs => lease_seconds)
   where a.id in (
     select id from public.automations
      where is_enabled and next_run_at is not null and next_run_at <= now() and user_id = auth.uid()
      order by next_run_at
      for update skip locked
   )
  returning a.*;
$$;

create or replace function public.claim_automation_events(max_rows int default 200)
returns setof public.automation_events
language sql security invoker set search_path = public as $$
  update public.automation_events e
     set processed_at = now()
   where e.id in (
     select id from public.automation_events
      where processed_at is null and user_id = auth.uid()
      order by created_at
      limit max_rows
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.claim_due_automations(int) from public, anon;
revoke execute on function public.claim_automation_events(int) from public, anon;
grant execute on function public.claim_due_automations(int) to authenticated, service_role;
grant execute on function public.claim_automation_events(int) to authenticated, service_role;
