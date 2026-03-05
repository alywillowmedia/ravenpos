-- Harden function execution context by pinning search_path for advisor warnings.
-- This mitigates object name hijacking risks, especially for SECURITY DEFINER funcs.

ALTER FUNCTION public.adjust_customer_store_credit(UUID, NUMERIC) SET search_path = public;
ALTER FUNCTION public.current_user_is_member_of_thread(UUID) SET search_path = public;
ALTER FUNCTION public.employees_refresh_chat_memberships_trigger() SET search_path = public;
ALTER FUNCTION public.generate_gift_card_code() SET search_path = public;
ALTER FUNCTION public.get_system_thread_id(TEXT) SET search_path = public;
ALTER FUNCTION public.get_user_consignor_id() SET search_path = public;
ALTER FUNCTION public.get_user_role() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.refresh_employee_system_chat_memberships(UUID, BOOLEAN) SET search_path = public;
ALTER FUNCTION public.refresh_user_system_chat_memberships(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.sync_consignor_derived_fields() SET search_path = public;
ALTER FUNCTION public.sync_consignor_rate_schedule_booth_rent() SET search_path = public;
ALTER FUNCTION public.thread_has_employee_member(UUID) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.users_refresh_chat_memberships_trigger() SET search_path = public;
