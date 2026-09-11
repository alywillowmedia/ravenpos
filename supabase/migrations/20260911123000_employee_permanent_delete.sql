-- Store transactions survive permanent employee deletion without a dangling link.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_processed_by_employee_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_processed_by_employee_fkey
    FOREIGN KEY (processed_by_employee) REFERENCES public.employees(id) ON DELETE SET NULL;
