-- Fix employee direct-message creation for PIN/anonymous employee sessions.
-- The original function expected auth.role() = 'anon', but anonymous auth users
-- in Supabase commonly execute as authenticated users with is_anonymous metadata.
-- Validate employee actor identity via current_employee_id() instead.

CREATE OR REPLACE FUNCTION public.create_or_get_direct_thread(
  p_actor_member_type TEXT,
  p_actor_user_id UUID,
  p_actor_employee_id UUID,
  p_peer_member_type TEXT,
  p_peer_user_id UUID,
  p_peer_employee_id UUID
)
RETURNS UUID AS $$
DECLARE
  actor_key TEXT;
  peer_key TEXT;
  calculated_direct_key TEXT;
  thread_uuid UUID;
BEGIN
  IF p_actor_member_type NOT IN ('user', 'employee') OR p_peer_member_type NOT IN ('user', 'employee') THEN
    RAISE EXCEPTION 'Invalid member type';
  END IF;

  IF p_actor_member_type = 'user' THEN
    IF p_actor_user_id IS NULL OR p_actor_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Invalid actor user';
    END IF;
    actor_key := 'u:' || p_actor_user_id::TEXT;
  ELSE
    IF p_actor_employee_id IS NULL OR p_actor_employee_id <> public.current_employee_id() THEN
      RAISE EXCEPTION 'Invalid actor employee';
    END IF;
    actor_key := 'e:' || p_actor_employee_id::TEXT;
  END IF;

  IF p_peer_member_type = 'user' THEN
    IF p_peer_user_id IS NULL THEN
      RAISE EXCEPTION 'Missing peer user';
    END IF;
    peer_key := 'u:' || p_peer_user_id::TEXT;
  ELSE
    IF p_peer_employee_id IS NULL THEN
      RAISE EXCEPTION 'Missing peer employee';
    END IF;
    peer_key := 'e:' || p_peer_employee_id::TEXT;
  END IF;

  IF actor_key = peer_key THEN
    RAISE EXCEPTION 'Cannot create direct thread with self';
  END IF;

  calculated_direct_key := (
    SELECT string_agg(k, '|' ORDER BY k)
    FROM (VALUES (actor_key), (peer_key)) AS keys(k)
  );

  SELECT id INTO thread_uuid
  FROM public.chat_threads
  WHERE direct_key = calculated_direct_key
  LIMIT 1;

  IF thread_uuid IS NULL THEN
    INSERT INTO public.chat_threads (thread_type, direct_key, title, created_by_user_id)
    VALUES ('direct', calculated_direct_key, NULL, p_actor_user_id)
    RETURNING id INTO thread_uuid;
  END IF;

  IF p_actor_member_type = 'user' THEN
    INSERT INTO public.chat_thread_members (thread_id, member_type, user_id)
    VALUES (thread_uuid, 'user', p_actor_user_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.chat_thread_members (thread_id, member_type, employee_id)
    VALUES (thread_uuid, 'employee', p_actor_employee_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_peer_member_type = 'user' THEN
    INSERT INTO public.chat_thread_members (thread_id, member_type, user_id)
    VALUES (thread_uuid, 'user', p_peer_user_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.chat_thread_members (thread_id, member_type, employee_id)
    VALUES (thread_uuid, 'employee', p_peer_employee_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_or_get_direct_thread(TEXT, UUID, UUID, TEXT, UUID, UUID) TO authenticated, anon;
