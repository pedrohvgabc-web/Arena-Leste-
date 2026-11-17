import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Keep CSRF protection for server-function requests. The public frontend is a
// Render Static Site and proxies server functions to the Node service, so the
// backend must explicitly trust only the official Arena origins.
const trustedOrigins = new Set([
  "https://arena-leste.onrender.com",
  "https://arena-elsinho.onrender.com",
]);
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (origin) => trustedOrigins.has(origin),
  secFetchSite: ["same-origin", "same-site"],
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
