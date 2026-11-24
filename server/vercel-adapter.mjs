/**
 * Bridge a Node (req, res) function — what Vercel's Node runtime gives you — to the Web-standard
 * Request/Response handlers in /server/api. This is the only Vercel-specific code in the project:
 * the handlers themselves stay host-agnostic (Netlify v2, Node dev server, this adapter).
 */

/**
 * @param {(req: Request, env?: Record<string,string|undefined>, deps?: object) => Promise<Response>} handler
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function toNodeHandler(handler) {
  return async function nodeHandler(req, res) {
    const method = req.method || "GET";
    try {
      let body;
      if (method !== "GET" && method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks);
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
      }

      const host = req.headers.host || "localhost";
      const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
      const url = `${protocol}://${host}${req.url || "/"}`;

      const request = new Request(url, { method, headers, body });

      const response = await handler(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      // Vercel shows stdout/stderr in the deployment's function logs; a silent 500 hides a dead database.
      console.error(`api ${method} ${req.url} failed`, err);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ error: "server_error" }));
    }
  };
}
