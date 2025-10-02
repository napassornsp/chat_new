-- 1) Fix reset_monthly_credits ambiguity and create notifications & help_requests tables

-- Fix function by qualifying table columns to avoid conflict with OUT params
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS TABLE(v1 integer, v2 integer, v3 integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  current_month date := (date_trunc('month', now()))::date;
  p_rec record;
  uc_rec public.user_credits%ROWTYPE;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO uc_rec FROM public.user_credits WHERE user_id = uid;

  -- Fetch plan credits (can be null for Business/custom plans)
  SELECT p.credits_v1, p.credits_v2, p.credits_v3
    INTO p_rec
  FROM public.profiles pr
  JOIN public.plans p ON p.id = pr.plan_id
  WHERE pr.id = uid;

  IF uc_rec.user_id IS NULL THEN
    INSERT INTO public.user_credits (user_id, v1, v2, v3, last_reset_month)
    VALUES (
      uid,
      COALESCE(p_rec.credits_v1, 10),
      COALESCE(p_rec.credits_v2, 20),
      COALESCE(p_rec.credits_v3, 30),
      current_month
    );
  ELSIF uc_rec.last_reset_month <> current_month THEN
    UPDATE public.user_credits uc
    SET
      v1 = COALESCE(p_rec.credits_v1, uc.v1),
      v2 = COALESCE(p_rec.credits_v2, uc.v2),
      v3 = COALESCE(p_rec.credits_v3, uc.v3),
      last_reset_month = current_month,
      updated_at = now()
    WHERE uc.user_id = uid;
  END IF;

  RETURN QUERY SELECT uc.v1, uc.v2, uc.v3 FROM public.user_credits uc WHERE uc.user_id = uid;
END;
$function$;

-- 2) Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- 3) Help requests table
CREATE TABLE IF NOT EXISTS public.help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own help requests"
ON public.help_requests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own help requests"
ON public.help_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 4) Update timestamp trigger (reuse existing function)
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_help_requests_updated_at ON public.help_requests;
CREATE TRIGGER trg_help_requests_updated_at
BEFORE UPDATE ON public.help_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();