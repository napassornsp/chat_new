-- Add approved flags if missing and indexes for quick filtering
ALTER TABLE public.ocr_bill_extractions
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

ALTER TABLE public.ocr_bank_extractions
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ocr_bill_extractions_approved ON public.ocr_bill_extractions (approved);
CREATE INDEX IF NOT EXISTS idx_ocr_bank_extractions_approved ON public.ocr_bank_extractions (approved);
