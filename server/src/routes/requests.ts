import { Router } from "express";
import { z } from "zod";
import { normalizeWhatsapp } from "../../../shared/phone";
import { clientIp } from "../http/auth";
import { limits } from "../http/security";
import { createRequest, requestStatus } from "../services/requests";

export const requestsRouter = Router();

const createSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2, "Enter your name.").max(80, "That name is too long."),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .transform((value, ctx) => {
      const normalized = normalizeWhatsapp(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number, e.g. 98765 43210." });
        return z.NEVER;
      }
      return normalized;
    }),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().email("Enter a valid email address, or leave it empty.").nullable()),
  flipbookId: z.string().trim().max(40).optional().nullable(),
});

requestsRouter.post("/", limits.createRequest, async (req, res) => {
  const body = createSchema.parse(req.body);
  const request = await createRequest({
    planCode: body.planCode,
    name: body.name,
    whatsapp: body.whatsapp,
    email: body.email,
    flipbookId: body.flipbookId ?? null,
    customer: req.customer,
    visitorId: req.visitorId,
    ip: clientIp(req),
  });
  res.status(201).json(await requestStatus(request.code));
});

requestsRouter.get("/:code", limits.requestStatus, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  res.setHeader("Cache-Control", "no-store");
  res.json(await requestStatus(code));
});
