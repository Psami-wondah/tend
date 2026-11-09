/* Tend's service worker: the circle's alerts, and acting on them from the notification. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Tend", body: event.data ? event.data.text() : "" };
  }
  // Open Tend pages update straight away, alongside the notification.
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => open.forEach((c) => c.postMessage({ type: "tend-refresh" })));
  event.waitUntil(
    self.registration.showNotification(data.title || "Tend", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: Boolean(data.actions && data.actions.length),
      actions: data.actions || [],
      data,
    }),
  );
});

function done(data, verdict, ok, message) {
  const person = data.person || "their";
  const payee = data.payee || "the payee";
  if (!ok) return { title: "That didn't go through", body: message || "Open Tend to try again." };
  if (data.actions && data.actions[0] && data.actions[0].title === "Stop it") {
    return verdict === "reject"
      ? { title: `Stopped: ${payee}`, body: `PayPal voided the hold. The money never left ${person}'s account.` }
      : { title: `Paid: ${payee}`, body: "You said yes, so PayPal captured the hold and sent it." };
  }
  return verdict === "approve" ? { title: `You approved ${payee}`, body: "Tend will pay it once enough of the circle agrees." } : { title: `You declined ${payee}`, body: "No payment was made." };
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const verdict = event.action === "approve" || event.action === "reject" ? event.action : null;

  if (verdict && data.intentId && data.memberId) {
    event.waitUntil(
      fetch(`/api/payments/${data.intentId}/verdict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: data.memberId, verdict, note: verdict === "reject" ? "Stopped from the alert" : undefined }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          const msg = done(data, verdict, res.ok, json.error);
          await self.registration.showNotification(msg.title, { body: msg.body, icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag, data: { url: data.url } });
          const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          for (const c of open) c.postMessage({ type: "tend-refresh" });
        })
        .catch(() => self.registration.showNotification("That didn't go through", { body: "Open Tend to try again.", data: { url: data.url } })),
    );
    return;
  }

  const url = data.url || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      for (const c of open) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
