CREATE TABLE public.pi_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  source text NOT NULL DEFAULT 'browser',
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  played_at timestamptz
);
GRANT ALL ON public.pi_messages TO service_role;
ALTER TABLE public.pi_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX pi_messages_pending_idx ON public.pi_messages (created_at) WHERE claimed_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_next_pi_message()
RETURNS SETOF public.pi_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pi_messages SET claimed_at = now()
  WHERE id = (
    SELECT id FROM public.pi_messages
    WHERE claimed_at IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_next_pi_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_pi_message() TO service_role;