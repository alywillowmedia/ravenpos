-- Fix messaging RLS for employee sessions that authenticate as "authenticated"
-- users with anonymous metadata (instead of Postgres role = anon).
-- Align policies with current_employee_id() identity resolution.

CREATE OR REPLACE FUNCTION public.current_user_is_member_of_thread(p_thread_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.chat_thread_members m
    WHERE m.thread_id = p_thread_id
      AND (
        (m.member_type = 'user' AND m.user_id = auth.uid())
        OR (
          m.member_type = 'employee'
          AND m.employee_id = public.current_employee_id()
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Employee anon can read employee threads" ON public.chat_threads;
CREATE POLICY "Employee anon can read employee threads" ON public.chat_threads
  FOR SELECT USING (
    public.current_employee_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_thread_members m
      WHERE m.thread_id = public.chat_threads.id
        AND m.member_type = 'employee'
        AND m.employee_id = public.current_employee_id()
    )
  );

DROP POLICY IF EXISTS "Users can update own threads" ON public.chat_threads;
CREATE POLICY "Users can update own threads" ON public.chat_threads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chat_thread_members m
      WHERE m.thread_id = public.chat_threads.id
        AND (
          (m.member_type = 'user' AND m.user_id = auth.uid())
          OR (
            m.member_type = 'employee'
            AND m.employee_id = public.current_employee_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Employee anon can manage employee thread members" ON public.chat_thread_members;
CREATE POLICY "Employee anon can manage employee thread members" ON public.chat_thread_members
  FOR SELECT USING (
    member_type = 'employee'
    AND employee_id = public.current_employee_id()
  );

DROP POLICY IF EXISTS "Users can mark own threads read" ON public.chat_thread_members;
CREATE POLICY "Users can mark own threads read" ON public.chat_thread_members
  FOR UPDATE USING (
    (member_type = 'user' AND user_id = auth.uid())
    OR (
      member_type = 'employee'
      AND employee_id = public.current_employee_id()
    )
  );

DROP POLICY IF EXISTS "Employee anon can read messages" ON public.chat_messages;
CREATE POLICY "Employee anon can read messages" ON public.chat_messages
  FOR SELECT USING (
    public.current_employee_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_thread_members m
      WHERE m.thread_id = public.chat_messages.thread_id
        AND m.member_type = 'employee'
        AND m.employee_id = public.current_employee_id()
    )
  );

DROP POLICY IF EXISTS "Users can send messages in own threads" ON public.chat_messages;
CREATE POLICY "Users can send messages in own threads" ON public.chat_messages
  FOR INSERT WITH CHECK (
    (sender_type = 'user' AND sender_user_id = auth.uid())
    OR
    (
      sender_type = 'employee'
      AND sender_employee_id = public.current_employee_id()
      AND EXISTS (
        SELECT 1 FROM public.chat_thread_members m
        WHERE m.thread_id = public.chat_messages.thread_id
          AND m.member_type = 'employee'
          AND m.employee_id = sender_employee_id
      )
    )
  );
