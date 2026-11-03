import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import "./InstallPrompt.css";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "menuu-install-dismissed-until";
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissed() {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + REMIND_AFTER_MS));
  } catch {
    // El aviso puede cerrarse aunque el almacenamiento esté desactivado.
  }
}

export function InstallPrompt({
  suppressed = false,
}: {
  suppressed?: boolean;
}) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showMobileGuide, setShowMobileGuide] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isInstalled() || wasDismissed()) return;

    const isiOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isiOS) setShowIosGuide(true);
    else if (/Android|Mobile/.test(navigator.userAgent))
      setShowMobileGuide(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setShowIosGuide(false);
      setShowMobileGuide(false);
      setHidden(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (
    suppressed ||
    hidden ||
    (!installEvent && !showIosGuide && !showMobileGuide)
  )
    return null;

  const dismiss = () => {
    rememberDismissal();
    setHidden(true);
  };

  const install = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "dismissed") rememberDismissal();
      setHidden(true);
      setInstallEvent(null);
    } catch {
      setInstallEvent(null);
    }
  };

  return (
    <aside className="install-prompt" aria-label="Añadir Menúu al inicio">
      <img src="/images/menuu-logo.png" alt="" width="40" height="37" />
      <div className="install-prompt-copy">
        <strong>Lleva Menúu a tu inicio</strong>
        <span>
          {installEvent
            ? "Abre tus pedidos más rápido, como una app."
            : showIosGuide
              ? "Toca Compartir y luego Añadir a pantalla de inicio."
              : "Abre el menú del navegador y elige Instalar app o Añadir a inicio."}
        </span>
      </div>
      {installEvent && (
        <button
          type="button"
          className="install-prompt-action"
          onClick={install}
        >
          <Download size={17} aria-hidden="true" />
          Añadir
        </button>
      )}
      <button
        type="button"
        className="install-prompt-close"
        onClick={dismiss}
        aria-label="Cerrar aviso para añadir Menúu al inicio"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
