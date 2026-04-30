export const config = { runtime: "edge" };

const ORIGIN_ROOT = (process.env.ORIGIN_ENDPOINT || "").replace(/\/$/, "");

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

export default async function edgeRelay(ctxReq) {
  if (!ORIGIN_ROOT) {
    return new Response("Misconfigured: ORIGIN_ENDPOINT is not set", {
      status: 500,
    });
  }

  try {
    const pathIdx = ctxReq.url.indexOf("/", 8);

    const finalUrl =
      pathIdx === -1
        ? `${ORIGIN_ROOT}/`
        : `${ORIGIN_ROOT}${ctxReq.url.slice(pathIdx)}`;

    const hdrBucket = new Headers();
    let clientChainIp = null;

    for (const [key, val] of ctxReq.headers) {
      if (
        FILTERED_HEADER_KEYS.has(key) ||
        key.startsWith("x-vercel-")
      ) {
        continue;
      }

      if (key === "x-real-ip") {
        clientChainIp = val;
        continue;
      }

      if (key === "x-forwarded-for") {
        if (!clientChainIp) clientChainIp = val;
        continue;
      }

      hdrBucket.set(key, val);
    }

    if (clientChainIp) {
      hdrBucket.set("x-forwarded-for", clientChainIp);
    }

    const verb = ctxReq.method;
    const attachBody = verb !== "GET" && verb !== "HEAD";

    const res = await fetch(finalUrl, {
      method: verb,
      headers: hdrBucket,
      body: attachBody ? ctxReq.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    return res;
  } catch (e) {
    console.error("relay error:", e);

    return new Response("Bad Gateway: Tunnel Failed", {
      status: 502,
    });
  }
}
