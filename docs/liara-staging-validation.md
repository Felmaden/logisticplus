# Liara Staging Validation

This runbook validates Logistic Plus with synthetic data before any production cleanup release. Never restore or copy production records or document objects into staging.

## Target Resources

Provision isolated staging resources:

- Network: `staging`
- App: `logisticplus-staging` (Node 22, `small-g2`, standard feature plan)
- PostgreSQL 16 database: `logisticplus-staging-database` (`small-g2`, private `staging` network)
- Private ArvanCloud bucket: `logisticplus-staging-documents` in `ir-thr-at1`
- Separate staging-only database, S3, session, and bootstrap credentials

The repo includes [liara.staging.json](../liara.staging.json). It targets the staging app without a persistent disk because staging must match production's object-storage mode.

If the app explicitly runs out of memory or cannot remain healthy on `small-g2`, resize staging only to `medium-g2`. Do not change application code to fit staging capacity.

## Staging Environment

Set these in the Liara staging app environment. Store secret values in Liara, never in source or shell history.

```text
NODE_ENV=production
DATABASE_URL=<private-liara-staging-postgres-url>
APP_PUBLIC_URL=https://<liara-staging-domain>
SESSION_SECRET=<unique-staging-secret>
DOCUMENT_STORAGE_MODE=object
DOCUMENT_STORAGE_DIR=/tmp
DOCUMENT_MAX_BYTES=26214400
OBJECT_STORAGE_ENABLED=true
OBJECT_STORAGE_PROVIDER=s3
DOCUMENT_STORAGE_DUAL_WRITE_REQUIRED=true
S3_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
S3_REGION=ir-thr-at1
S3_ACCESS_KEY_ID=<staging-only-access-key>
S3_SECRET_ACCESS_KEY=<staging-only-secret-key>
S3_DOCUMENT_BUCKET=logisticplus-staging-documents
S3_FORCE_PATH_STYLE=true
RATE_LIMIT_STORE=postgres
TRUST_PROXY=true
INITIAL_ADMIN_EMAIL=<synthetic-admin-email>
INITIAL_ADMIN_PASSWORD=<strong-unique-staging-password>
INITIAL_ADMIN_NAME=<synthetic-admin-name>
INITIAL_ORG_NAME=<synthetic-organization-name>
```

Do not reuse production credentials, customer names, addresses, identifiers, files, or database contents.

## Database Setup

This bootstrap exception applies only to a newly provisioned, verified empty staging database.

1. In the staging database console, confirm the selected resource is `logisticplus-staging-database`, it is attached only to the `staging` network, and the `public` schema has no application tables or rows. Stop if the database is not empty or its identity is uncertain.
2. Deploy the exact tested commit to `logisticplus-staging`.
3. Run migrations and status from the app shell so the application uses its private `DATABASE_URL`:

```powershell
liara shell --app logisticplus-staging --command "npm run db:migrate"
liara shell --app logisticplus-staging --command "npm run db:migrate:status"
```

4. Confirm the staging migration names and checksums exactly match production, with no pending, missing, or extra entries. At the recovery baseline captured on 2026-07-15, production recorded 36 migrations while this branch contained 33 files. Do not initialize staging until the three deployed migration files have been restored to source and their checksums verified in a separate migration-history repair.
5. Dry-run, then commit only the approved core and admin bootstrap commands:

```powershell
liara shell --app logisticplus-staging --command "npm run seed:production-core -- --dry-run"
liara shell --app logisticplus-staging --command "npm run seed:production-core"
liara shell --app logisticplus-staging --command "npm run seed:production-admin -- --dry-run"
liara shell --app logisticplus-staging --command "npm run seed:production-admin"
liara shell --app logisticplus-staging --command "npm run db:migrate:status"
```

Never run `db:bridge`, demo seeds, cleanup utilities, migration baseline commands, storage backfill execution, QA repair scripts, or test-reset commands against staging or production.

## Deploy

Deploy the exact locally tested commit:

```powershell
npm run deploy:staging
```

Equivalent raw command:

```powershell
liara deploy --liara-json liara.staging.json --app logisticplus-staging --port 3000 --no-app-logs
```

The installed Liara CLI must support `--no-app-logs`; verify with `liara deploy --help` before the first deploy. Keep zero-downtime deployment enabled.

## Local Preflight

Use Node 22 from a fresh install before deploying:

```powershell
npm ci
npm run safety:check
npm run lint
npm run build
npm run smoke:production-config
npm run db:migrate:fresh:test
npm run db:migrate:current:test
npm run seed:production-core:test
npm run seed:production-admin:test
npm run test:e2e:setup
npm run test:e2e
```

## Synthetic Staging Smoke

Use only the dedicated synthetic tenant and synthetic shipment created for staging checks:

```powershell
$env:STAGING_PUBLIC_URL = "https://<liara-staging-domain>"
$env:STAGING_OWNER_EMAIL = "<synthetic-admin-email>"
$env:STAGING_OWNER_PASSWORD = "<strong-unique-staging-password>"
$env:STAGING_SMOKE_SHIPMENT_ID = "<synthetic-shipment-id>"
npm run smoke:staging
```

Verify health, authentication, dashboard, customers, shipments, tasks, cross-tenant denial, private document reads, and public-tracking redaction. The existing smoke script also checks the app shell, removed public APIs, private document upload/download, and customer-visible document exposure.

Do not use `STAGING_SKIP_AUTH_SMOKE` for a release gate. It is only for deliberately narrowed diagnostics.

## Rollback Rehearsal

1. Deploy two tested commits to staging and record both Liara release IDs.
2. Run the complete synthetic smoke on the newer release.
3. Switch the app to the previous staging release without changing the database or bucket.
4. Rerun the complete synthetic smoke.
5. Roll forward to the newer release and rerun the smoke.
6. Confirm zero-downtime remained enabled and no synthetic records or objects disappeared.

Any migration/status failure, document failure, tenant leak, missing route, broken write, or elevated error rate blocks promotion. Do not repair, reseed, delete, or restore automatically.
