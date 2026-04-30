export const config = { runtime: "edge" };

const ORIGIN_ROOT = (process.env.ORIGIN_ENDPOINT || "").replace(/\/$/, "");
const REQ_HOST = process.env.REQ_HOST || "";
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

const FILTERED_HEADER_KEYS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function edgeRelay(req) {
  if (!ORIGIN_ROOT) {
    return new Response("Misconfigured: ORIGIN_ENDPOINT is not set", {
      status: 500,
    });
  }

  try {
    const url = new URL(req.url);
    const incomingPath = url.pathname + url.search;

    const finalUrl = `${ORIGIN_ROOT}${BASE_PATH}${incomingPath}`;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, val] of req.headers) {
      if (
        FILTERED_HEADER_KEYS.has(key) ||
        key.startsWith("x-vercel-")
      ) {
        continue;
      }

      if (key === "x-real-ip") {
        clientIp = val;
        continue;
      }

      if (key === "x-forwarded-for") {
        if (!clientIp) clientIp = val;
        continue;
      }

      headers.set(key, val);
    }

    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
    }

    if (REQ_HOST) {
      headers.set("host", REQ_HOST);
      headers.set("origin", `https://${REQ_HOST}`);
    }

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const response = await fetch(finalUrl, {
      method,
      headers,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    return response;
  } catch (err) {
    console.error("relay error:", err);

    return new Response("Bad Gateway: Tunnel Failed", {
      status: 502,
    });
  }
}