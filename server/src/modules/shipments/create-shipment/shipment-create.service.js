export async function createShipment({
  createShipmentRecord,
  ownerUserId,
  actorUserId,
  tenantContext,
  shipment,
}) {
  return createShipmentRecord({
    ownerUserId,
    actorUserId,
    tenantContext,
    shipment,
  });
}
