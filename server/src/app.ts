import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { env } from "./env";
import { session, visitor } from "./http/auth";
import { apiNotFound, errorHandler } from "./http/errors";
import { sameOrigin, securityHeaders } from "./http/security";
import { adminRouter } from "./routes/admin";
import { flipbooksRouter } from "./routes/flipbooks";
import { pagesRouter } from "./routes/pages";
import { publicRouter } from "./routes/public";
import { requestsRouter } from "./routes/requests";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(cookieParser(env.cookieSecret));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));
  app.use(sameOrigin);

  const api = Router();
  api.use(visitor, session);
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use("/", publicRouter);
  api.use("/flipbooks", flipbooksRouter);
  api.use("/requests", requestsRouter);
  api.use("/admin", adminRouter);
  api.use(apiNotFound);
  app.use("/api", api);

  app.use(["/v", "/d"], visitor, session);
  app.use(pagesRouter);

  // The built React app (npm run build). In development Vite serves it and
  // proxies /api, /v and /d here.
  if (existsSync(join(env.webDist, "index.html"))) {
    app.use(
      express.static(env.webDist, {
        index: false,
        maxAge: "1h",
        setHeaders(res, path) {
          if (path.includes(`${sep}assets${sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      })
    );
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(env.webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
