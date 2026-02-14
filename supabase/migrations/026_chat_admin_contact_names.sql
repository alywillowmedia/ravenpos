-- Include admin display names in messaging contact lookup

DROP FUNCTION IF EXISTS get_chat_admin_contacts();

CREATE OR REPLACE FUNCTION get_chat_admin_contacts()
RETURNS TABLE(id UUID, email TEXT, full_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.full_name
  FROM users u
  WHERE u.role = 'admin'
  ORDER BY COALESCE(NULLIF(trim(u.full_name), ''), u.email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_chat_admin_contacts() TO authenticated, anon;
