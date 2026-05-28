-- Let deleting an employee remove employee-only portal user rows instead of
-- nulling users.employee_id into a state that violates users_employee_role_link_check.

ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_employee_id_fkey;

ALTER TABLE public.users
ADD CONSTRAINT users_employee_id_fkey
FOREIGN KEY (employee_id)
REFERENCES public.employees(id)
ON DELETE CASCADE;
