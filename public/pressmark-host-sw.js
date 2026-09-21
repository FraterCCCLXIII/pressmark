const PREFIX = "/__pressmark/host";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return;
  }
  event.respondWith(relay(event.request));
});

const respond = (status, body) =>
  new Response(status === 204 ? "" : JSON.stringify(body ?? {}), {
    status,
    headers: corsHeaders,
  });

const relay = async (request) => {
  if (request.method === "OPTIONS") {
    return respond(204, {});
  }

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const client = clients[0];
  if (!client) {
    return respond(503, { error: "host_offline" });
  }

  const body = request.method === "GET" ? null : await request.text();
  const result = await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve({ status: 504, body: { error: "timeout" } }), 8000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data ?? { status: 500, body: { error: "empty" } });
    };
    client.postMessage(
      {
        type: "pressmark-host-request",
        method: request.method,
        path: new URL(request.url).pathname,
        headers: { authorization: request.headers.get("authorization") },
        body,
      },
      [channel.port2],
    );
  });

  return respond(result.status || 200, result.body);
};
