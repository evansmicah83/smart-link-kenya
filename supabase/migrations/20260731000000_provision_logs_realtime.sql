-- Enable realtime on provision_logs so the UI receives live log inserts
ALTER TABLE public.provision_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provision_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provision_logs;
  END IF;
END $$;
