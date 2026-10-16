-- Conclusão atômica (status + comentário final) e comentários em qualquer status.
-- Execute no SQL Editor do Supabase.

begin;

-- SECURITY INVOKER: roda com o RLS do próprio usuário (vendedor só conclui a própria tarefa).
-- Tudo na mesma transação: se o comentário falhar, a conclusão é revertida.
create or replace function public.complete_task(p_task_id uuid, p_comment text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated int;
begin
  update public.tasks
     set status = 'concluida', completed_at = now()
   where id = p_task_id and status in ('pendente','em_andamento');
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Tarefa não encontrada, sem permissão ou já encerrada';
  end if;

  if p_comment is not null and length(trim(p_comment)) > 0 then
    insert into public.task_comments (task_id, author_id, body)
    values (p_task_id, auth.uid(), trim(p_comment));
  end if;
end;
$$;

grant execute on function public.complete_task(uuid, text) to authenticated;

-- Policy de insert: autor = usuário logado + acesso à tarefa. SEM condição de status,
-- então comentar em tarefa concluída/cancelada é permitido.
drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid())
    )
  );

notify pgrst, 'reload schema';

commit;
