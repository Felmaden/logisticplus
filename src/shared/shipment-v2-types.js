export const SHIPMENT_V2_FLOW_CODES = ["IMPORT_LANJ", "IMPORT_SHIP", "IMPORT_RAIL"];

export const SHIPMENT_V2_FLOW_DEFINITIONS = {
  IMPORT_LANJ: {
    shipmentTypeCode: "IMPORT_LENJ",
    shipmentDirection: "import",
    transportMode: "sea",
    labelFa: "ملوانی",
  },
  IMPORT_SHIP: {
    shipmentTypeCode: "IMPORT_SEA_CONTAINER",
    shipmentDirection: "import",
    transportMode: "sea",
    labelFa: "تجاری / کشتی",
  },
  IMPORT_RAIL: {
    shipmentTypeCode: "IMPORT_RAIL_CARGO",
    shipmentDirection: "import",
    transportMode: "rail",
    labelFa: "تجاری / قطار (ریلی)",
  },
};

export function shipmentV2FlowDefinition(flowCode) {
  return SHIPMENT_V2_FLOW_DEFINITIONS[String(flowCode || "").trim().toUpperCase()] || null;
}

export function shipmentV2FlowCodeForShipmentType(shipmentTypeCode) {
  const normalized = String(shipmentTypeCode || "").trim().toUpperCase();
  if (normalized === "IMPORT_RAIL_CARGO") return "IMPORT_RAIL";
  if (normalized.includes("LENJ") || normalized.includes("LANJ")) return "IMPORT_LANJ";
  return "IMPORT_SHIP";
}

export function isLanjShipmentV2Flow(flowCode) {
  return String(flowCode || "").trim().toUpperCase() === "IMPORT_LANJ";
}

export function isCommercialShipmentV2Flow(flowCode) {
  return ["IMPORT_SHIP", "IMPORT_RAIL"].includes(String(flowCode || "").trim().toUpperCase());
}

export function showsShipmentV2ContainerCounts(flowCode) {
  return String(flowCode || "").trim().toUpperCase() === "IMPORT_SHIP";
}

export function shipmentV2ClassificationLabel(flowCode, lenjType) {
  const normalizedFlow = String(flowCode || "").trim().toUpperCase();
  if (normalizedFlow === "IMPORT_LANJ") {
    const normalizedLenjType = String(lenjType || "").trim().toUpperCase();
    if (normalizedLenjType === "TEH_LENJI") return "ملوانی / ته‌لنجی";
    if (normalizedLenjType === "MALVANI") return "ملوانی / ملوانی";
    return "ملوانی / نوع ثبت نشده";
  }
  return shipmentV2FlowDefinition(normalizedFlow)?.labelFa || "نوع ثبت نشده";
}
