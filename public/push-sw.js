self.addEventListener("push", (event) => {
  let message = {};

  try {
    message = event.data ? event.data.json() : {};
  } catch {
    /* use fallback */
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Menúu", {
      body: message.body || "Tu pedido está por llegar al punto de encuentro.",
      icon: "/icons/menuu-apple-touch.png",
      badge: "/icons/menuu-apple-touch.png",
      tag: message.tag || "menuu-recojo",
      data: { url: "/#pedidos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(
        event.notification.data?.url || "/#pedidos",
        self.location.origin,
      ).href;
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (windowClient) =>
          new URL(windowClient.url).origin === self.location.origin,
      );

      if (existing) {
        await existing.navigate(url);

        return existing.focus();
      }

      return clients.openWindow(url);
    })(),
  );
});
