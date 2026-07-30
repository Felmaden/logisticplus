# Shipment Module V2

## Commercial ship shipping section

Commercial ship profiles (`IMPORT_SHIP`) include a `shipping` section immediately after declaration and Kootaj.

The section stores:

- One optional provider type: `SHIPPING_LINE` or `FORWARDER`
- One optional provider name
- Up to 100 container rows
- A container number plus discharge, delivery-order, and arrival-notice dates for each row

Container numbers are trimmed, normalized to uppercase, and must be unique within the shipment. Dates use the shared Shamsi date field in the UI and accept valid Shamsi `YYYY/MM/DD` or ISO `YYYY-MM-DD` API values.

The editable section is available only on commercial ship profiles. Daily Status and Document Management show the same data read-only. Lanj and rail profiles do not expose the section and the API rejects attempts to update it.

The section is stored in the existing `shipment_v2_profiles.sections_json` JSONB document. Existing profiles receive an empty normalized section at read time, so no database migration or backfill is required.
