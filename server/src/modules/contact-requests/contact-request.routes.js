import { parseRequestValue } from "../../shared/middleware/validate.middleware.js";
import {
  createContactRequest,
  listContactRequests,
  resolveContactRequest,
} from "./contact-request.repository.js";
import {
  contactRequestCreateBodySchema,
  contactRequestListQuerySchema,
  contactRequestParamsSchema,
} from "./contact-request.validation.js";

const CONTACT_REQUEST_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 };
const publicAcknowledgement = () => ({ ok: true, data: { accepted: true } });

function hasHoneypotValue(body) {
  if (body?.website === undefined || body?.website === null) return false;
  return String(body.website).trim().length > 0;
}

function routeError(res, createApiError, error, fallbackCode, fallbackMessage) {
  if (error?.statusCode === 403) {
    return createApiError(res, 403, "FORBIDDEN", error.message);
  }
  console.error(fallbackCode, error?.code || "UNKNOWN_ERROR");
  return createApiError(res, 500, fallbackCode, fallbackMessage);
}

export function registerContactRequestRoutes(
  app,
  {
    auditLog,
    consumeRateLimit,
    createApiError,
    requestContext,
    requirePlatformAdmin,
  }
) {
  app.post("/api/contact-requests", async (req, res) => {
    try {
      const allowed = await consumeRateLimit(req, res, "contact-request", CONTACT_REQUEST_LIMIT);
      if (!allowed) return;

      if (hasHoneypotValue(req.body)) {
        return res.status(201).json(publicAcknowledgement());
      }

      const body = parseRequestValue(res, contactRequestCreateBodySchema, req.body || {});
      if (!body) return;
      const context = requestContext(req);
      const created = await createContactRequest(body);
      await auditLog({
        actorType: "public",
        action: "contact_request.created",
        entityType: "CONTACT_REQUEST",
        entityId: created.id,
        summary: "Public demo request was created.",
        after: { status: created.status },
        requestContext: { requestId: context.requestId },
      });
      return res.status(201).json(publicAcknowledgement());
    } catch (error) {
      return routeError(
        res,
        createApiError,
        error,
        "CONTACT_REQUEST_FAILED",
        "Could not submit the demo request."
      );
    }
  });

  app.get("/api/admin/contact-requests", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const query = parseRequestValue(res, contactRequestListQuerySchema, req.query || {});
      if (!query) return;
      const data = await listContactRequests(query);
      return res.json({ ok: true, data });
    } catch (error) {
      return routeError(
        res,
        createApiError,
        error,
        "CONTACT_REQUESTS_FAILED",
        "Could not load contact requests."
      );
    }
  });

  app.post("/api/admin/contact-requests/:id/resolve", async (req, res) => {
    try {
      const user = await requirePlatformAdmin(req, res);
      if (!user) return;
      const params = parseRequestValue(res, contactRequestParamsSchema, req.params);
      if (!params) return;
      const data = await resolveContactRequest(params.id, user.id);
      if (!data) return createApiError(res, 404, "NOT_FOUND", "Contact request was not found.");
      await auditLog({
        actorUserId: user.id,
        organizationId: null,
        action: "contact_request.resolve",
        entityType: "CONTACT_REQUEST",
        entityId: data.id,
        summary: "Contact request was resolved by a platform admin.",
        after: { status: data.status },
        requestContext: requestContext(req),
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return routeError(
        res,
        createApiError,
        error,
        "CONTACT_REQUEST_RESOLVE_FAILED",
        "Could not resolve the contact request."
      );
    }
  });
}
