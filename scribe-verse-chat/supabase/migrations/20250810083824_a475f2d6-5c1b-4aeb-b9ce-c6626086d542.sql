-- Add OCR credit limits per plan
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS ocr_bill_limit integer,
  ADD COLUMN IF NOT EXISTS ocr_bank_limit integer;

-- Seed limits for known plans
UPDATE public.plans SET ocr_bill_limit = 12, ocr_bank_limit = 13 WHERE name = 'Free';
UPDATE public.plans SET ocr_bill_limit = 14, ocr_bank_limit = 15 WHERE name = 'Plus';
UPDATE public.plans SET ocr_bill_limit = 16, ocr_bank_limit = 17 WHERE name = 'Premium';

-- Extend user_credits with OCR buckets
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS ocr_bill integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS ocr_bank integer NOT NULL DEFAULT 13;

-- RPC to reset monthly OCR credits based on plan
CREATE OR REPLACE FUNCTION public.reset_monthly_ocr_credits()
RETURNS TABLE(bill integer, bank integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid;
  current_month date := (date_trunc('month', now()))::date;
  p_rec record;
  uc_rec record;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO uc_rec FROM public.user_credits WHERE user_id = uid;

  -- Fetch plan-specific OCR limits (can be null for custom plans)
  SELECT p.ocr_bill_limit, p.ocr_bank_limit
    INTO p_rec
  FROM public.profiles pr
  JOIN public.plans p ON p.id = pr.plan_id
  WHERE pr.id = uid;

  IF uc_rec IS NULL THEN
    INSERT INTO public.user_credits (user_id, ocr_bill, ocr_bank, last_reset_month)
    VALUES (
      uid,
      COALESCE(p_rec.ocr_bill_limit, 12),
      COALESCE(p_rec.ocr_bank_limit, 13),
      current_month
    );
  ELSIF uc_rec.last_reset_month <> current_month THEN
    UPDATE public.user_credits
    SET
      ocr_bill = COALESCE(p_rec.ocr_bill_limit, ocr_bill),
      ocr_bank = COALESCE(p_rec.ocr_bank_limit, ocr_bank),
      last_reset_month = current_month,
      updated_at = now()
    WHERE user_id = uid;
  END IF;

  RETURN QUERY SELECT ocr_bill, ocr_bank FROM public.user_credits WHERE user_id = uid;
END;
$$;

-- History tables for OCR (Bill & Bank)
CREATE TABLE IF NOT EXISTS public.ocr_bill_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text,
  file_url text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ocr_bank_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text,
  file_url text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ocr_bill_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_bank_extractions ENABLE ROW LEVEL SECURITY;

-- Policies (CRUD only for owner)
DO $$ BEGIN
  CREATE POLICY "Users can view their own ocr bill extractions"
  ON public.ocr_bill_extractions FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own ocr bill extractions"
  ON public.ocr_bill_extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own ocr bill extractions"
  ON public.ocr_bill_extractions FOR UPDATE
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own ocr bill extractions"
  ON public.ocr_bill_extractions FOR DELETE
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their own ocr bank extractions"
  ON public.ocr_bank_extractions FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own ocr bank extractions"
  ON public.ocr_bank_extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own ocr bank extractions"
  ON public.ocr_bank_extractions FOR UPDATE
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own ocr bank extractions"
  ON public.ocr_bank_extractions FOR DELETE
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER update_ocr_bill_extractions_updated_at
  BEFORE UPDATE ON public.ocr_bill_extractions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_ocr_bank_extractions_updated_at
  BEFORE UPDATE ON public.ocr_bank_extractions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
