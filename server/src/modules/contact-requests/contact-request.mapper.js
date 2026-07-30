export function toUiContactRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    preferredContactMethod: row.preferred_contact_method || "phone",
    message: row.message || "",
    status: row.status || "new",
    resolvedById: row.resolved_by_id || null,
    resolvedByName: row.resolved_by_name || "",
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
