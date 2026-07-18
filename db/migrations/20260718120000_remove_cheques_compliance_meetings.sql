-- Permanently retire the cheque and compliance-meeting features.
--
-- This migration intentionally does not delete shared documents, document
-- versions, stored objects, tasks, audit logs, change logs, or SMS history.
-- DROP statements omit CASCADE so an unexpected dependency blocks the
-- migration instead of being removed implicitly.

-- Fail and roll back instead of waiting behind active production traffic.
-- The restore rehearsal must prove the bounded statement window is sufficient
-- for the verified production-sized copy before this migration is approved.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE UPPER(role) = 'COMPLIANCE_STAFF'
  ) AND NOT EXISTS (
    SELECT 1
    FROM roles
    WHERE UPPER(name) = 'COMPLIANCE_STAFF'
  ) THEN
    RAISE EXCEPTION 'Cannot retire COMPLIANCE_STAFF users because their role catalog entry is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE UPPER(role) = 'COMPLIANCE_STAFF'
  ) AND NOT EXISTS (
    SELECT 1
    FROM roles
    WHERE UPPER(name) = 'OPERATIONS'
  ) THEN
    RAISE EXCEPTION 'Cannot retire COMPLIANCE_STAFF because the OPERATIONS role is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM roles retired_role
    JOIN role_permissions retired_grant ON retired_grant.role_id = retired_role.id
    JOIN permissions retired_permission ON retired_permission.id = retired_grant.permission_id
    WHERE UPPER(retired_role.name) = 'COMPLIANCE_STAFF'
      AND LOWER(retired_permission.key) NOT IN ('cheques.manage', 'compliance.manage')
      AND NOT EXISTS (
        SELECT 1
        FROM roles operations_role
        JOIN role_permissions operations_grant ON operations_grant.role_id = operations_role.id
        WHERE UPPER(operations_role.name) = 'OPERATIONS'
          AND operations_grant.permission_id = retired_permission.id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot retire COMPLIANCE_STAFF because OPERATIONS lacks a non-retired permission';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM roles operations_role
    JOIN role_permissions operations_grant ON operations_grant.role_id = operations_role.id
    JOIN permissions operations_permission ON operations_permission.id = operations_grant.permission_id
    CROSS JOIN roles retired_role
    WHERE UPPER(operations_role.name) = 'OPERATIONS'
      AND UPPER(retired_role.name) = 'COMPLIANCE_STAFF'
      AND LOWER(operations_permission.key) NOT IN ('cheques.manage', 'compliance.manage')
      AND NOT EXISTS (
        SELECT 1
        FROM role_permissions retired_grant
        WHERE retired_grant.role_id = retired_role.id
          AND retired_grant.permission_id = operations_permission.id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot retire COMPLIANCE_STAFF because OPERATIONS has an additional non-retired permission';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM subscription_plans
    WHERE jsonb_typeof(COALESCE(features, '{}'::jsonb)) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Cannot retire subscription features because a plan feature payload is not a JSON object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM organization_subscriptions
    WHERE jsonb_typeof(COALESCE(limits_override, '{}'::jsonb)) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Cannot retire subscription features because an organization override payload is not a JSON object';
  END IF;

  IF to_regclass('public.ai_business_search_index') IS NOT NULL
     OR to_regclass('public.organization_ai_memory') IS NOT NULL
     OR to_regclass('public.organization_ai_memory_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot retire cheque data because legacy AI tables unexpectedly exist and require scoped review';
  END IF;
END $$;

-- Keep existing tasks, but detach them from the retired meeting feature.
UPDATE tasks
SET source_type = 'manual',
    source_id = NULL,
    legacy_data = COALESCE(legacy_data, '{}'::jsonb)
      - 'sourceType'
      - 'sourceId'
      - 'source_type'
      - 'source_id'
WHERE UPPER(COALESCE(source_type, '')) = 'COMPLIANCE_MEETING'
   OR UPPER(COALESCE(legacy_data->>'sourceType', '')) = 'COMPLIANCE_MEETING'
   OR UPPER(COALESCE(legacy_data->>'source_type', '')) = 'COMPLIANCE_MEETING';

-- Keep compatibility snapshots aligned with the preserved canonical rows.
UPDATE user_records
SET data = (data - 'sourceType' - 'sourceId' - 'source_type' - 'source_id')
  || jsonb_build_object('sourceType', 'MANUAL')
WHERE LOWER(collection) = 'tasks'
  AND (
    UPPER(COALESCE(data->>'sourceType', '')) = 'COMPLIANCE_MEETING'
    OR UPPER(COALESCE(data->>'source_type', '')) = 'COMPLIANCE_MEETING'
  );

UPDATE user_records
SET data = jsonb_set(
  data #- '{data,sourceId}' #- '{data,source_id}' #- '{data,source_type}',
  '{data,sourceType}',
  '"MANUAL"'::jsonb,
  TRUE
)
WHERE LOWER(collection) = 'deleteditems'
  AND (
    UPPER(COALESCE(data->>'entityType', '')) = 'TASK'
    OR UPPER(COALESCE(data->>'entity_type', '')) = 'TASK'
  )
  AND (
    UPPER(COALESCE(data#>>'{data,sourceType}', '')) = 'COMPLIANCE_MEETING'
    OR UPPER(COALESCE(data#>>'{data,source_type}', '')) = 'COMPLIANCE_MEETING'
  );

UPDATE user_records
SET data = jsonb_set(data, '{role}', '"OPERATIONS"'::jsonb, TRUE)
WHERE LOWER(collection) = 'users'
  AND UPPER(COALESCE(data->>'role', '')) = 'COMPLIANCE_STAFF';

-- Remove canonical compatibility rows owned by the retired features. Preserve
-- unrelated compatibility history, including activity-log records.
DELETE FROM user_records
WHERE LOWER(collection) IN ('cheques', 'appointments')
   OR (
     LOWER(collection) = 'deleteditems'
     AND (
       UPPER(COALESCE(data->>'entityType', '')) IN (
         'CHEQUE',
         'APPOINTMENT',
         'COMPLIANCE_MEETING'
       )
       OR UPPER(COALESCE(data->>'entity_type', '')) IN (
         'CHEQUE',
         'APPOINTMENT',
         'COMPLIANCE_MEETING'
       )
     )
   )
   OR (
     LOWER(collection) = 'notifications'
     AND (
       UPPER(COALESCE(data->>'sourceType', '')) IN (
         'CHEQUE',
         'APPOINTMENT',
         'COMPLIANCE_MEETING'
       )
       OR UPPER(COALESCE(data->>'source_type', '')) IN (
         'CHEQUE',
         'APPOINTMENT',
         'COMPLIANCE_MEETING'
       )
       OR COALESCE(data->>'sourceId', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
       OR COALESCE(data->>'source_id', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
       OR COALESCE(data->>'link', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
       OR COALESCE(data#>>'{legacy_data,link}', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
     )
   );

DELETE FROM notifications
WHERE UPPER(COALESCE(source_type, '')) IN (
        'CHEQUE',
        'APPOINTMENT',
        'COMPLIANCE_MEETING'
      )
   OR COALESCE(source_id, '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
   OR COALESCE(legacy_data->>'link', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)';

DELETE FROM archive_records
WHERE LOWER(entity_type) IN ('cheque', 'appointment', 'compliance_meeting');

-- Remove feature entitlements without changing unrelated plan limits.
UPDATE subscription_plans
SET features = COALESCE(features, '{}'::jsonb) - ARRAY(
      SELECT key
      FROM jsonb_object_keys(COALESCE(features, '{}'::jsonb)) AS retired_feature(key)
      WHERE LOWER(key) IN ('cheques', 'compliance')
    ),
    updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_object_keys(COALESCE(features, '{}'::jsonb)) AS retired_feature(key)
  WHERE LOWER(key) IN ('cheques', 'compliance')
);

UPDATE subscription_plans
SET description = 'برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.',
    updated_at = NOW()
WHERE id = 'business'
  AND description = 'برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری، چک و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.';

UPDATE organization_subscriptions
SET limits_override = COALESCE(limits_override, '{}'::jsonb) - ARRAY(
      SELECT key
      FROM jsonb_object_keys(COALESCE(limits_override, '{}'::jsonb)) AS retired_feature(key)
      WHERE LOWER(key) IN ('cheques', 'compliance')
    ),
    updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM jsonb_object_keys(COALESCE(limits_override, '{}'::jsonb)) AS retired_feature(key)
  WHERE LOWER(key) IN ('cheques', 'compliance')
);

-- Preserve users while moving the retired specialist role to the equivalent
-- operational role. Organization membership remains active and tenant-scoped.
UPDATE app_users
SET role = 'OPERATIONS',
    updated_at = NOW()
WHERE UPPER(role) = 'COMPLIANCE_STAFF';

UPDATE organization_members
SET role = 'member'
WHERE UPPER(role) = 'COMPLIANCE_STAFF';

DELETE FROM role_permissions
WHERE role_id IN (
  SELECT id
  FROM roles
  WHERE UPPER(name) = 'COMPLIANCE_STAFF'
);

DELETE FROM roles
WHERE UPPER(name) = 'COMPLIANCE_STAFF';

UPDATE roles
SET description = 'Finance access',
    updated_at = NOW()
WHERE UPPER(name) = 'FINANCE'
  AND description IS DISTINCT FROM 'Finance access';

DELETE FROM user_permissions
WHERE permission_id IN (
  SELECT id
  FROM permissions
  WHERE LOWER(key) IN ('cheques.manage', 'compliance.manage')
);

DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id
  FROM permissions
  WHERE LOWER(key) IN ('cheques.manage', 'compliance.manage')
);

DELETE FROM permissions
WHERE LOWER(key) IN ('cheques.manage', 'compliance.manage');

-- Explicit child-before-parent order. No CASCADE is allowed here.
DROP TABLE IF EXISTS meeting_required_documents;
DROP TABLE IF EXISTS compliance_meetings;
DROP TABLE IF EXISTS cheques;

-- Shared document rows and files remain; only retired feature associations go.
ALTER TABLE documents
  DROP COLUMN IF EXISTS meeting_id,
  DROP COLUMN IF EXISTS cheque_id;
