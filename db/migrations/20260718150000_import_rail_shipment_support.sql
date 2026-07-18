-- Expand Shipment V2 for import rail without rewriting existing shipment/profile rows.

DO $$
DECLARE
  current_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'shipment_v2_profiles'::regclass
    AND conname = 'shipment_v2_profiles_flow_code_check';

  IF current_definition IS NULL OR current_definition NOT LIKE '%IMPORT_RAIL%' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'shipment_v2_profiles'::regclass
        AND conname = 'shipment_v2_profiles_flow_code_check_expanded'
    ) THEN
      ALTER TABLE shipment_v2_profiles
        ADD CONSTRAINT shipment_v2_profiles_flow_code_check_expanded
        CHECK (flow_code IN ('IMPORT_LANJ', 'IMPORT_SHIP', 'IMPORT_RAIL')) NOT VALID;
    END IF;

    ALTER TABLE shipment_v2_profiles
      VALIDATE CONSTRAINT shipment_v2_profiles_flow_code_check_expanded;

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'shipment_v2_profiles'::regclass
        AND conname = 'shipment_v2_profiles_flow_code_check'
    ) THEN
      ALTER TABLE shipment_v2_profiles
        DROP CONSTRAINT shipment_v2_profiles_flow_code_check;
    END IF;

    ALTER TABLE shipment_v2_profiles
      RENAME CONSTRAINT shipment_v2_profiles_flow_code_check_expanded
      TO shipment_v2_profiles_flow_code_check;
  END IF;
END $$;

INSERT INTO shipment_form_templates (
  id, organization_id, code, shipment_type_code, title_fa, description,
  is_system, is_active, version, created_at, updated_at
)
VALUES (
  'sft-import-rail-cargo', NULL, 'default-import-rail-cargo', 'IMPORT_RAIL_CARGO',
  'قالب واردات ریلی', 'قالب پایه مشترک برای واردات ریلی؛ بدون فیلد تخصصی قطار.',
  TRUE, TRUE, 1, NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE SET
  shipment_type_code = EXCLUDED.shipment_type_code,
  title_fa = EXCLUDED.title_fa,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO shipment_form_template_sections (
  id, template_id, section_key, title_fa, description, sort_order,
  is_collapsed_by_default, created_at, updated_at
)
VALUES
  ('sfts-import-rail-cargo-base', 'sft-import-rail-cargo', 'base', 'اطلاعات پایه', '', 1, FALSE, NOW(), NOW()),
  ('sfts-import-rail-cargo-goods', 'sft-import-rail-cargo', 'goods', 'کالا', '', 2, FALSE, NOW(), NOW()),
  ('sfts-import-rail-cargo-declaration', 'sft-import-rail-cargo', 'declaration', 'اظهار و ترخیص', '', 3, FALSE, NOW(), NOW()),
  ('sfts-import-rail-cargo-payments-release', 'sft-import-rail-cargo', 'payments-release', 'پرداخت ها و خروج', '', 4, FALSE, NOW(), NOW()),
  ('sfts-import-rail-cargo-commercial-card', 'sft-import-rail-cargo', 'commercial-card', 'کارت بازرگانی', '', 5, FALSE, NOW(), NOW()),
  ('sfts-import-rail-cargo-internal-note', 'sft-import-rail-cargo', 'internal-note', 'یادداشت داخلی', '', 6, TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  title_fa = EXCLUDED.title_fa,
  sort_order = EXCLUDED.sort_order,
  is_collapsed_by_default = EXCLUDED.is_collapsed_by_default,
  updated_at = NOW();

INSERT INTO shipment_form_template_fields (
  id, template_id, section_id, field_key, field_source, field_type, label_fa,
  helper_text, placeholder, sort_order, is_visible, is_required, is_important,
  show_in_shipment_detail, show_in_daily_status, show_in_create_form,
  validation_json, options_json, created_at, updated_at
)
VALUES
  ('sftf-import-rail-cargo-shipment-code', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-base', 'shipmentCode', 'canonical', 'readonly', 'کد محموله / شماره پرونده', '', '', 1, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-customer-name', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-base', 'customerName', 'canonical', 'readonly', 'مشتری', '', '', 2, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-shipment-status', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-base', 'shipmentStatus', 'canonical', 'readonly', 'وضعیت محموله', '', '', 3, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-workflow-step', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-base', 'workflowStep', 'canonical', 'readonly', 'مرحله فعلی', '', '', 4, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-workflow-route', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-base', 'workflowRoute', 'canonical', 'readonly', 'مسیر فرایند', '', '', 5, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-goods-summary', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-goods', 'goodsSummary', 'canonical', 'textarea', 'خلاصه کالا', '', '', 1, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-package-count', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-goods', 'packageCount', 'canonical', 'number', 'تعداد بسته', '', '', 2, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-gross-weight', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-goods', 'grossWeightKg', 'canonical', 'number', 'وزن ناخالص', '', '', 3, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-cotage-number', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-declaration', 'cotageNumber', 'canonical', 'text', 'شماره کوتاژ', '', '', 1, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-customs-route', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-declaration', 'customsRoute', 'canonical', 'select', 'مسیر گمرکی', '', '', 2, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-customs-status', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-declaration', 'customsStatus', 'canonical', 'select', 'وضعیت گمرکی', '', '', 3, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-customs-office', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-declaration', 'customsOffice', 'canonical', 'text', 'گمرک / محل اظهار', '', '', 4, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-payment-status', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-payments-release', 'customsPaymentStatus', 'canonical', 'select', 'وضعیت پرداخت گمرکی', '', '', 1, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-release-status', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-payments-release', 'releaseStatus', 'canonical', 'select', 'وضعیت ترخیص / خروج', '', '', 2, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-exit-date', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-payments-release', 'exitDate', 'canonical', 'date', 'تاریخ خروج', '', '', 3, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-commercial-card', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-commercial-card', 'commercialCardId', 'canonical', 'commercialCard', 'کارت بازرگانی', '', '', 1, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-commercial-card-display', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-commercial-card', 'commercialCardDisplay', 'canonical', 'readonly', 'نمایش کارت انتخاب شده', '', '', 2, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW()),
  ('sftf-import-rail-cargo-internal-note', 'sft-import-rail-cargo', 'sfts-import-rail-cargo-internal-note', 'internalNote', 'canonical', 'textarea', 'یادداشت داخلی', '', '', 1, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, '{}'::jsonb, '[]'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  section_id = EXCLUDED.section_id,
  field_source = EXCLUDED.field_source,
  field_type = EXCLUDED.field_type,
  label_fa = EXCLUDED.label_fa,
  sort_order = EXCLUDED.sort_order,
  is_important = EXCLUDED.is_important,
  updated_at = NOW();
