const APP_URL = "/admin";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const body = typeof payload.body === "string" ? payload.body : "";
  if (!body) return;

  event.waitUntil(
    self.registration.showNotification("Nova reserva", {
      body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: typeof payload.tag === "string" ? payload.tag : "arena-leste-booking",
      data: { url: APP_URL },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(APP_URL, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === destination);
      if (existing && "focus" in existing) return existing.focus();
      return self.clients.openWindow(destination);
    }),
  );
});