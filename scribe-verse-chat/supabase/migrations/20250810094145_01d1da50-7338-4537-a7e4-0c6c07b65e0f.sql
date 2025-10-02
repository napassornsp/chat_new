-- Add approved flag to OCR extraction tables
ALTER TABLE public.ocr_bill_extractions
ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

ALTER TABLE public.ocr_bank_extractions
ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;