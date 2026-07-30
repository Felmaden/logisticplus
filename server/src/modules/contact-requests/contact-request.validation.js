import { z } from "../../shared/middleware/validate.middleware.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedString = (max) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const contactRequestCreateBodySchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required.").max(200),
  contactName: z.string().trim().min(1, "Contact name is required.").max(200),
  contactEmail: z.preprocess(
    blankToUndefined,
    z.string().trim().max(240).email("Enter a valid email address.").optional()
  ),
  contactPhone: optionalTrimmedString(80),
  preferredContactMethod: z.enum(["phone", "email", "either"]).default("phone"),
  message: optionalTrimmedString(2000),
  website: z.string().trim().max(500).optional().default(""),
}).strict().superRefine((value, context) => {
  if (!value.contactEmail && !value.contactPhone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactPhone"],
      message: "A phone number or email address is required.",
    });
  }
});

export const contactRequestListQuerySchema = z.object({
  status: z.enum(["new", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
}).strict();

export const contactRequestParamsSchema = z.object({
  id: z.string().trim().min(1).max(100),
}).strict();
