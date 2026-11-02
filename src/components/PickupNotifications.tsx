import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

type Status = "loading" | "unavailable" | "unsupported" | "blocked" | "off" | "on";

async function pushRequest(path: string, data: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const message = await response.json().catch(() => null);
    throw new Error(message?.error || "No pudimos guardar tu preferencia de avisos.");
  }
}

function vapidBytes(key: string) {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

export async function disablePickupNotifications() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await pushRequest("/api/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

export function PickupNotifications({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch("/api/push/config");
      const config = await response.json();
      if (!active) return;
      if (!config.enabled || !config.publicKey) { setStatus("unavailable"); return; }
      setPublicKey(config.publicKey);
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") { setStatus("blocked"); return; }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription && Notification.permission === "granted") {
        await pushRequest("/api/push/subscription", subscription.toJSON());
        if (active) setStatus("on");
      } else if (active) setStatus("off");
    })().catch(() => { if (active) setStatus("unavailable"); });
    return () => { active = false; };
  }, [userId]);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      // The browser permission prompt must follow this explicit click.
      const permission = Notification.permission === "granted"
        ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(publicKey),
      });
      await pushRequest("/api/push/subscription", subscription.toJSON());
      setStatus("on");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos activar los avisos.");
    } finally { setBusy(false); }
  }

  if (status === "loading" || status === "unavailable") return null;
  return <div className="pickup-notifications">
    <Bell size={21} aria-hidden="true" />
    <div>
      <strong>{status === "on" ? "Avisos activados" : "¿Te avisamos antes del recojo?"}</strong>
      <p>{status === "on"
        ? "Te enviaremos un aviso 5 minutos antes, si el servicio de notificaciones está disponible."
        : status === "unsupported"
          ? "Este navegador no admite avisos. En iPhone, añade Menúu a la pantalla de inicio para activarlos."
        : status === "blocked"
          ? "Las notificaciones están bloqueadas en este navegador. Puedes habilitarlas desde sus ajustes."
          : "Activa las notificaciones para recibir un aviso 5 minutos antes del recojo."}</p>
      {error && <p role="alert" className="pickup-notifications-error">{error}</p>}
      {status === "off" && <button type="button" onClick={enable} disabled={busy}>
        {busy ? "Activando…" : "Activar avisos"}
      </button>}
      {status === "on" && <button type="button" onClick={async () => {
        setBusy(true);
        try { await disablePickupNotifications(); setStatus("off"); }
        catch { setError("No pudimos desactivar los avisos en este dispositivo."); }
        finally { setBusy(false); }
      }} disabled={busy}>Desactivar avisos</button>}
    </div>
  </div>;
}
