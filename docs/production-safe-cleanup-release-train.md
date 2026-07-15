# Production-Safe Cleanup Release Train

Production remains at Liara release `v120` and Git SHA `f57ad269fc0f7ab0c3b686a02acf72b61628c357` until the recovery baseline, object-mode staging, rollback rehearsal, and draft PRs 00-02 are all green.

## Release Units

Each row is a separate, independently reversible PR and production release.

| Unit | Scope | Minimum observation |
| --- | --- | --- |
| 3A | Daily Status unused schema/types and unrendered edit draft | 60 minutes |
| 3B | Controlled, embedded-only Admin Panel | 60 minutes |
| 3C | Settings placeholders and misleading controls | 24 hours |
| 3D-1 | Stop installing client performance instrumentation; retain module | 24 hours |
| 3D-2 | Delete the dormant performance module and metric calls | 24 hours after 3D-1 |
| 3E | Retire hidden quotation and shipment-template administration UI; retain redirects and backend/data engines | 24 hours |
| 4A | Direct imports for audit, search, and rates | 24 hours |
| 4B | Direct imports for notifications and Daily Status | 24 hours |
| 4C | Direct imports for customers and tasks | 24 hours |
| 4D | Direct imports for shipments | 24 hours |
| 4E | Direct imports for documents | 24 hours |
| 4F | Direct imports for auth, billing, organizations, and users | 24 hours |
| 4G | Remove only proven-unreachable scaffolding/wrappers and centralize Shipment V2 section keys | 24 hours |
| 5A | Reuse canonical document/user mappers, sanitizer, and audit metadata builder | 24-hour business cycle |
| 5B | Remove only compatibility internals unreachable behind the canonical-data guard | 24-hour business cycle |
| 5C | Remove the dead rate-limit API while retaining active consumers | 24-hour business cycle |
| 5D | Verify rate-limit migration objects, then replace runtime creation with readiness checks | 24-hour business cycle |
| 6 | Rerun audits, document intentional retention, verify schema/migration diff, and report actual deletions | No production behavior change |

## Blocker Gates

Do not advance a unit unless all earlier gates remain green:

- A fresh encrypted database backup and complete read-only object copy have verified manifests; a PostgreSQL 16 restore rehearsal and object-reference/checksum checks pass.
- Production migration history and source must contain the same names and checksums. The 2026-07-15 baseline found 36 applied production migrations but only 33 files at the release SHA; the three exact deployed files were recovered and checksum-verified for recovery evidence, but staging and deployment remain blocked until source history is repaired in a separate review.
- The disposable restored database and its PostgreSQL data directory have been destroyed; encrypted originals remain under the approved retention policy.
- Synthetic object-mode staging passes migration status, full smoke, and rollback/roll-forward rehearsal with zero-downtime enabled.
- The exact commit passes the required Node 22 release commands. Phase-specific security, tenant, document, route, and UI tests also pass.
- The diff contains no unintended schema, migration, API, DTO, route, permission, or customer-data changes.
- Production backup and previous release are available. Any tenant leak, missing record, document failure, broken write, route loss, or unexplained error/count change stops the train.

Code-only rollback is the previous application release. Never restore production database or bucket contents for a code-only rollback. If bad writes are confirmed, stop affected writes and compare a separate restored backup before a reviewed targeted repair.

The quotation backend/data, shipment-template/workflow engine, and `user_records` compatibility bridge remain intentionally retained. Bridge retirement requires a separate expand/migrate/verify/contract program.
