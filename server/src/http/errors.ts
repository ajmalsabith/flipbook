import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import type { ApiErrorBody, DenyReason } from "../../../shared/api";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: { reason?: DenyReason; fields?: Record<string, string> } = {}
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, "bad_request", message, { fields });
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const unauthorized = (message = "Please log in.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You cannot do that.") =>
  new HttpError(403, "forbidden", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(notFound("Unknown API route."));
};

function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: "server_error", message: "Something went wrong. Please try again." };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: err.code, message: err.message, ...err.extra };
  } else if (err instanceof ZodError) {
    status = 400;
    const fields = zodFields(err);
    body = { error: "invalid_input", message: Object.values(fields)[0] ?? "Invalid input.", fields };
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const messages: Partial<Record<string, string>> = {
      LIMIT_FILE_SIZE: "A file is larger than allowed.",
      LIMIT_FILE_COUNT: "Too many pages.",
      LIMIT_UNEXPECTED_FILE: "Too many pages, or an unexpected file.",
    };
    body = { error: "upload_rejected", message: messages[err.code] ?? "The upload was rejected." };
  } else if ((err as { type?: string })?.type === "entity.too.large") {
    status = 413;
    body = { error: "too_large", message: "The request is too large." };
  } else {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  if (res.headersSent) return;
  res.status(status).json(body);
};
