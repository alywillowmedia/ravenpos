-- Messaging system for admin/vendor/employee communication

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_type TEXT NOT NULL CHECK (thread_type IN ('direct', 'group')),
  title TEXT,
  system_key TEXT UNIQUE,
  direct_key TEXT UNIQUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_thread_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('user', 'employee')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chat_thread_member_identity_check CHECK (
    (member_type = 'user' AND user_id IS NOT NULL AND employee_id IS NULL)
    OR
    (member_type = 'employee' AND employee_id IS NOT NULL AND user_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'employee')),
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  CONSTRAINT chat_message_sender_identity_check CHECK (
    (sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_employee_id IS NULL)
    OR
    (sender_type = 'employee' AND sender_employee_id IS NOT NULL AND sender_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_members_unique_user
  ON chat_thread_members(thread_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_members_unique_employee
  ON chat_thread_members(thread_id, employee_id)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_thread_members_user
  ON chat_thread_members(member_type, user_id, thread_id)
  WHERE member_type = 'user';

CREATE INDEX IF NOT EXISTS idx_chat_thread_members_employee
  ON chat_thread_members(member_type, employee_id, thread_id)
  WHERE member_type = 'employee';

CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message
  ON chat_threads(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON chat_messages(thread_id, created_at DESC);

CREATE OR REPLACE FUNCTION get_system_thread_id(p_key TEXT)
RETURNS UUID AS $$
DECLARE
  thread_uuid UUID;
BEGIN
  SELECT id INTO thread_uuid FROM chat_threads WHERE system_key = p_key LIMIT 1;
  RETURN thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_is_member_of_thread(p_thread_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM chat_thread_members m
    WHERE m.thread_id = p_thread_id
      AND m.member_type = 'user'
      AND m.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION thread_has_employee_member(p_thread_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM chat_thread_members m
    WHERE m.thread_id = p_thread_id
      AND m.member_type = 'employee'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_chat_admin_contacts()
RETURNS TABLE(id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email
  FROM users u
  WHERE u.role = 'admin'
  ORDER BY u.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_chat_admin_contacts() TO authenticated, anon;

CREATE OR REPLACE FUNCTION create_or_get_direct_thread(
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
    IF p_actor_employee_id IS NULL OR auth.role() <> 'anon' THEN
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
  FROM chat_threads
  WHERE direct_key = calculated_direct_key
  LIMIT 1;

  IF thread_uuid IS NULL THEN
    INSERT INTO chat_threads (thread_type, direct_key, title, created_by_user_id)
    VALUES ('direct', calculated_direct_key, NULL, p_actor_user_id)
    RETURNING id INTO thread_uuid;
  END IF;

  IF p_actor_member_type = 'user' THEN
    INSERT INTO chat_thread_members (thread_id, member_type, user_id)
    VALUES (thread_uuid, 'user', p_actor_user_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO chat_thread_members (thread_id, member_type, employee_id)
    VALUES (thread_uuid, 'employee', p_actor_employee_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_peer_member_type = 'user' THEN
    INSERT INTO chat_thread_members (thread_id, member_type, user_id)
    VALUES (thread_uuid, 'user', p_peer_user_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO chat_thread_members (thread_id, member_type, employee_id)
    VALUES (thread_uuid, 'employee', p_peer_employee_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION create_or_get_direct_thread(TEXT, UUID, UUID, TEXT, UUID, UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION refresh_user_system_chat_memberships(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
DECLARE
  admins_thread UUID;
  admin_employees_thread UUID;
  admin_consignors_thread UUID;
BEGIN
  SELECT get_system_thread_id('admins') INTO admins_thread;
  SELECT get_system_thread_id('admin_employees') INTO admin_employees_thread;
  SELECT get_system_thread_id('admin_consignors') INTO admin_consignors_thread;

  DELETE FROM chat_thread_members m
  USING chat_threads t
  WHERE m.thread_id = t.id
    AND m.member_type = 'user'
    AND m.user_id = p_user_id
    AND t.system_key IS NOT NULL;

  IF p_role = 'admin' THEN
    INSERT INTO chat_thread_members (thread_id, member_type, user_id)
    VALUES
      (admins_thread, 'user', p_user_id),
      (admin_employees_thread, 'user', p_user_id),
      (admin_consignors_thread, 'user', p_user_id)
    ON CONFLICT DO NOTHING;
  ELSIF p_role = 'vendor' THEN
    INSERT INTO chat_thread_members (thread_id, member_type, user_id)
    VALUES (admin_consignors_thread, 'user', p_user_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_employee_system_chat_memberships(p_employee_id UUID, p_is_active BOOLEAN)
RETURNS VOID AS $$
DECLARE
  admin_employees_thread UUID;
BEGIN
  SELECT get_system_thread_id('admin_employees') INTO admin_employees_thread;

  DELETE FROM chat_thread_members m
  USING chat_threads t
  WHERE m.thread_id = t.id
    AND m.member_type = 'employee'
    AND m.employee_id = p_employee_id
    AND t.system_key IS NOT NULL;

  IF p_is_active THEN
    INSERT INTO chat_thread_members (thread_id, member_type, employee_id)
    VALUES (admin_employees_thread, 'employee', p_employee_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION chat_messages_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_threads
  SET
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE id = NEW.thread_id;

  UPDATE chat_thread_members
  SET unread_count = unread_count + 1
  WHERE thread_id = NEW.thread_id
    AND NOT (
      (NEW.sender_type = 'user' AND member_type = 'user' AND user_id = NEW.sender_user_id)
      OR
      (NEW.sender_type = 'employee' AND member_type = 'employee' AND employee_id = NEW.sender_employee_id)
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS chat_messages_after_insert_trigger ON chat_messages;
CREATE TRIGGER chat_messages_after_insert_trigger
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION chat_messages_after_insert();

CREATE OR REPLACE FUNCTION users_refresh_chat_memberships_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_user_system_chat_memberships(NEW.id, NEW.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_refresh_chat_memberships ON users;
CREATE TRIGGER users_refresh_chat_memberships
  AFTER INSERT OR UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION users_refresh_chat_memberships_trigger();

CREATE OR REPLACE FUNCTION employees_refresh_chat_memberships_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_employee_system_chat_memberships(NEW.id, NEW.is_active);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS employees_refresh_chat_memberships ON employees;
CREATE TRIGGER employees_refresh_chat_memberships
  AFTER INSERT OR UPDATE OF is_active ON employees
  FOR EACH ROW EXECUTE FUNCTION employees_refresh_chat_memberships_trigger();

INSERT INTO chat_threads (thread_type, title, system_key)
VALUES
  ('group', 'Admins', 'admins'),
  ('group', 'Admins + Employees', 'admin_employees'),
  ('group', 'Admins + Consignors', 'admin_consignors')
ON CONFLICT (system_key) DO NOTHING;

DO $$
DECLARE
  admin_thread UUID;
  admin_employees_thread UUID;
  admin_consignors_thread UUID;
BEGIN
  SELECT get_system_thread_id('admins') INTO admin_thread;
  SELECT get_system_thread_id('admin_employees') INTO admin_employees_thread;
  SELECT get_system_thread_id('admin_consignors') INTO admin_consignors_thread;

  INSERT INTO chat_thread_members (thread_id, member_type, user_id)
  SELECT admin_thread, 'user', u.id
  FROM users u
  WHERE u.role = 'admin'
  ON CONFLICT DO NOTHING;

  INSERT INTO chat_thread_members (thread_id, member_type, user_id)
  SELECT admin_employees_thread, 'user', u.id
  FROM users u
  WHERE u.role = 'admin'
  ON CONFLICT DO NOTHING;

  INSERT INTO chat_thread_members (thread_id, member_type, employee_id)
  SELECT admin_employees_thread, 'employee', e.id
  FROM employees e
  WHERE e.is_active = TRUE
  ON CONFLICT DO NOTHING;

  INSERT INTO chat_thread_members (thread_id, member_type, user_id)
  SELECT admin_consignors_thread, 'user', u.id
  FROM users u
  WHERE u.role IN ('admin', 'vendor')
  ON CONFLICT DO NOTHING;
END $$;

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_thread_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

DROP POLICY IF EXISTS "Users can read own threads" ON chat_threads;
DROP POLICY IF EXISTS "Users can create threads" ON chat_threads;
DROP POLICY IF EXISTS "Users can update own threads" ON chat_threads;
DROP POLICY IF EXISTS "Users can read thread members" ON chat_thread_members;
DROP POLICY IF EXISTS "Users can manage own thread membership" ON chat_thread_members;
DROP POLICY IF EXISTS "Users can mark own threads read" ON chat_thread_members;
DROP POLICY IF EXISTS "Users can read messages in own threads" ON chat_messages;
DROP POLICY IF EXISTS "Users can send messages in own threads" ON chat_messages;
DROP POLICY IF EXISTS "Employee anon can read employee threads" ON chat_threads;
DROP POLICY IF EXISTS "Employee anon can manage employee thread members" ON chat_thread_members;
DROP POLICY IF EXISTS "Employee anon can read messages" ON chat_messages;
DROP POLICY IF EXISTS "Employee anon can send messages" ON chat_messages;

CREATE POLICY "Users can read own threads" ON chat_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_thread_members m
      WHERE m.thread_id = chat_threads.id
        AND m.member_type = 'user'
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Employee anon can read employee threads" ON chat_threads
  FOR SELECT USING (
    auth.role() = 'anon'
    AND EXISTS (
      SELECT 1 FROM chat_thread_members m
      WHERE m.thread_id = chat_threads.id
        AND m.member_type = 'employee'
    )
  );

CREATE POLICY "Users can create threads" ON chat_threads
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    OR auth.role() = 'anon'
  );

CREATE POLICY "Users can update own threads" ON chat_threads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chat_thread_members m
      WHERE m.thread_id = chat_threads.id
        AND (
          (m.member_type = 'user' AND m.user_id = auth.uid())
          OR (auth.role() = 'anon' AND m.member_type = 'employee')
        )
    )
  );

CREATE POLICY "Users can read thread members" ON chat_thread_members
  FOR SELECT USING (
    current_user_is_member_of_thread(chat_thread_members.thread_id)
  );

CREATE POLICY "Employee anon can manage employee thread members" ON chat_thread_members
  FOR ALL USING (
    auth.role() = 'anon'
    AND thread_has_employee_member(chat_thread_members.thread_id)
  )
  WITH CHECK (
    auth.role() = 'anon'
    AND thread_has_employee_member(chat_thread_members.thread_id)
  );

CREATE POLICY "Users can manage own thread membership" ON chat_thread_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can mark own threads read" ON chat_thread_members
  FOR UPDATE USING (
    (member_type = 'user' AND user_id = auth.uid())
    OR (auth.role() = 'anon' AND member_type = 'employee')
  );

CREATE POLICY "Users can read messages in own threads" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_thread_members m
      WHERE m.thread_id = chat_messages.thread_id
        AND m.member_type = 'user'
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Employee anon can read messages" ON chat_messages
  FOR SELECT USING (
    auth.role() = 'anon'
    AND EXISTS (
      SELECT 1 FROM chat_thread_members m
      WHERE m.thread_id = chat_messages.thread_id
        AND m.member_type = 'employee'
    )
  );

CREATE POLICY "Users can send messages in own threads" ON chat_messages
  FOR INSERT WITH CHECK (
    (sender_type = 'user' AND sender_user_id = auth.uid())
    OR
    (
      auth.role() = 'anon'
      AND sender_type = 'employee'
      AND sender_employee_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM chat_thread_members m
        WHERE m.thread_id = chat_messages.thread_id
          AND m.member_type = 'employee'
          AND m.employee_id = sender_employee_id
      )
    )
  );

COMMENT ON TABLE chat_threads IS 'Message threads for direct and group chats.';
COMMENT ON TABLE chat_thread_members IS 'Thread participants and unread state per member.';
COMMENT ON TABLE chat_messages IS 'Individual chat messages.';
