import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  ShieldCheck,
  UtensilsCrossed,
  UserRound,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, EmptyState, SearchField } from "./components/ui";
import {
  BrandAccountIcon,
  BrandCalendarIcon,
  BrandCartIcon,
  BrandClockIcon,
  BrandDishIcon,
  BrandGoogleIcon,
  BrandLocationIcon,
  BrandLockedOrdersIcon,
  BrandLogoutIcon,
  BrandOrderBagIcon,
  BrandOrdersIcon,
  BrandStatsIcon,
  BrandStoreIcon,
} from "./components/BrandIcons";
import {
  BirthDatePicker,
  birthDateDisplay,
} from "./components/BirthDatePicker";
import {
  bookingDeadlineLabel,
  dateLabel,
  limaDayIndex,
  money,
  pickupWindow,
  weekDate,
  type Bootstrap,
  type CartItem,
  type Kitchen,
  type Offering,
  type Order,
  type SelectedChoices,
  type User,
} from "./data/catalog";
import KitchenDashboard, { type KitchenSection } from "./KitchenDashboard";
import { CustomizationDialog } from "./components/CustomizationDialog";

type Page =
  | "inicio"
  | "buscar"
  | "carrito"
  | "pedidos"
  | "cuenta"
  | "cocina"
  | "cocinaInicio"
  | "cocinaMenu"
  | "cocinaPlatos"
  | "cocinaEstadisticas"
  | "cocinaCuenta";
type PickupOption = { key: string; start: string; end: string };
const routes: Record<Page, string> = {
  inicio: "#inicio",
  buscar: "#menu",
  carrito: "#carrito",
  pedidos: "#pedidos",
  cuenta: "#cuenta",
  cocina: "#cocina",
  cocinaInicio: "#cocina/inicio",
  cocinaMenu: "#cocina/menu",
  cocinaPlatos: "#cocina/platos",
  cocinaEstadisticas: "#cocina/estadisticas",
  cocinaCuenta: "#cocina/cuenta",
};
const kitchenPages: Page[] = [
  "cocinaInicio",
  "cocinaMenu",
  "cocinaPlatos",
  "cocinaEstadisticas",
  "cocinaCuenta",
];
const kitchenNavigation = [
  { id: "cocinaInicio", label: "Inicio", icon: BrandStoreIcon },
  { id: "cocinaMenu", label: "Menús", icon: BrandCalendarIcon },
  { id: "cocinaPlatos", label: "Platos", icon: BrandDishIcon },
  { id: "cocinaEstadisticas", label: "Estadísticas", icon: BrandStatsIcon },
  { id: "cocinaCuenta", label: "Mi cocina", icon: BrandAccountIcon },
] as const;
function pageFromHash(hash: string): Page {
  if (/^#menu\/cocina\/[a-z0-9-]+$/.test(hash)) return "buscar";
  return (
    (Object.keys(routes) as Page[]).find((page) => routes[page] === hash) ??
    (hash.startsWith("#cocina/") ? "cocina" : "inicio")
  );
}
function kitchenFromHash(hash: string): string | null {
  return /^#menu\/cocina\/([a-z0-9-]+)$/.exec(hash)?.[1] || null;
}
const navigation = [
  { id: "inicio", label: "Inicio", icon: UtensilsCrossed },
  { id: "buscar", label: "Menú", icon: Search },
  { id: "carrito", label: "Carrito", icon: BrandCartIcon },
  { id: "pedidos", label: "Pedidos", icon: BrandOrdersIcon },
  { id: "cuenta", label: "Cuenta", icon: UserRound },
] as const;

function DataNoticeDialog({
  kind,
  onClose,
}: {
  kind: "consumer" | "kitchen";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="data-notice-dialog"
      aria-labelledby="data-notice-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <button
        type="button"
        className="icon-button data-notice-close"
        onClick={() => ref.current?.close()}
        aria-label="Cerrar aviso"
      >
        <X size={20} />
      </button>
      <span className="eyebrow">TUS DATOS EN MENÚU</span>
      <h2 id="data-notice-title">Datos y piloto académico</h2>
      <p>
        Menúu es un producto piloto con fines educativos para el curso
        Emprendimiento 1. Sus funciones pueden cambiar durante esta etapa.
      </p>
      {kind === "kitchen" ? (
        <>
          <h3>Si gestionas una cocina</h3>
          <p>
            Guardamos el correo de acceso, el nombre, la descripción y la foto
            de tu cocina, además de los platos, opciones y menús que publiques.
            El panel muestra las reservas y calcula estadísticas de los pedidos
            asociados a tu cocina.
          </p>
          <p>
            Estos datos se usan para administrar el catálogo y las reservas de
            la cocina, y para evaluar el funcionamiento del proyecto.
          </p>
        </>
      ) : (
        <>
          <h3>Si eres estudiante</h3>
          <p>
            Al crear tu cuenta guardamos tu correo institucional, nombre, código
            de estudiante, carrera y, si la agregas, fecha de nacimiento.
            También guardamos tus reservas, opciones elegidas, comentarios y
            reseñas para mostrarte tus pedidos y gestionar su entrega.
          </p>
          <p>
            Las cantidades reservadas y las reseñas permiten mostrar
            estadísticas a las cocinas y evaluar el funcionamiento del proyecto.
          </p>
        </>
      )}
      <p className="data-notice-consent">
        Este aviso te informa de esos usos. Abrirlo o cerrarlo no supone aceptar
        finalidades adicionales; cualquier uso distinto deberá informarse y
        solicitar tu consentimiento cuando corresponda.
      </p>
      <Button type="button" onClick={() => ref.current?.close()}>
        Entendido
      </Button>
    </dialog>,
    document.body,
  );
}

function AuthErrorToast({
  message,
  onClose,
  kitchen = false,
}: {
  message: string;
  onClose: () => void;
  kitchen?: boolean;
}) {
  return createPortal(
    <aside
      id="auth-error-toast"
      className={`auth-warning-toast${kitchen ? " kitchen-error-toast" : ""}`}
      role="alert"
    >
      <CircleAlert size={22} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Cerrar aviso" onClick={onClose}>
        <X size={19} aria-hidden="true" />
      </button>
    </aside>,
    document.body,
  );
}

const capitalizeFirst = (value: string) =>
  value.charAt(0).toLocaleUpperCase("es") + value.slice(1);
const limaToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const limaTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
const offerPrice = (offer: Offering, choices: SelectedChoices) =>
  offer.priceSoles +
  offer.customization.reduce(
    (extra, group) =>
      extra +
      group.choices.reduce(
        (sum, choice) =>
          sum +
          (choices[group.id]?.includes(choice.id) ? choice.priceSoles : 0),
        0,
      ),
    0,
  );

async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  let result: T & { error?: string };
  try {
    result = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error(
      "La API no devolvió datos válidos. Revisa la función y la conexión PostgreSQL del despliegue.",
    );
  }
  if (!response.ok)
    throw new Error(result.error || "No pudimos completar la solicitud.");
  return result;
}

const pickupDateTime = (
  offer: Pick<Offering, "date" | "deliveryTime" | "pickupUntil">,
) =>
  `${capitalizeFirst(dateLabel(offer.date, { weekday: "short", day: "numeric", month: "short" }))} · ${pickupWindow(offer.deliveryTime, offer.pickupUntil)}`;

function Pickup({
  offer,
  compact = false,
}: {
  offer: Pick<
    Offering,
    "date" | "deliveryTime" | "pickupUntil" | "bookingDeadline"
  >;
  compact?: boolean;
}) {
  return (
    <div
      className={`pickup-details ${compact ? "pickup-details-compact" : ""}`}
    >
      <div>
        <BrandClockIcon size={17} />
        <span>
          Reserva hasta:{" "}
          {capitalizeFirst(bookingDeadlineLabel(offer.bookingDeadline))}
        </span>
      </div>
      <div>
        <BrandCalendarIcon size={17} />
        <span>Recojo: {pickupDateTime(offer)}</span>
      </div>
    </div>
  );
}

function CartItemCard({
  item,
  offer,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  offer: Offering;
  onQuantity: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
}) {
  const unavailable = offer.remaining <= 0 || !offer.bookable;
  const overLimit = !unavailable && item.quantity > offer.remaining;
  const stockLabel =
    offer.remaining <= 0
      ? "Agotado · elimina este plato"
      : !offer.bookable
        ? "Reserva cerrada · elimina este plato"
        : overLimit
          ? `Solo quedan ${offer.remaining} ${offer.remaining === 1 ? "porción" : "porciones"} · ajusta la cantidad`
          : `${offer.remaining} ${offer.remaining === 1 ? "porción disponible" : "porciones disponibles"}`;
  return (
    <article
      className={`cart-item${unavailable ? " cart-item-unavailable" : ""}`}
    >
      <img src={offer.imageUrl} alt={offer.imageAlt} />
      <div className="cart-item-info">
        <h2>{offer.name}</h2>
        <p>{offer.kitchenName}</p>
        <Pickup offer={offer} compact />
        {offer.customization.map((group) => {
          const selected = group.choices.filter((choice) =>
            item.choices[group.id]?.includes(choice.id),
          );
          return (
            selected.length > 0 && (
              <p className="cart-choice" key={group.id}>
                {group.title}:{" "}
                {selected.map((choice) => choice.label).join(", ")}
              </p>
            )
          );
        })}
        {item.comment && (
          <p className="cart-choice">Comentario: {item.comment}</p>
        )}
        <p
          className={`cart-item-stock${unavailable || overLimit ? " cart-item-stock-alert" : ""}`}
          role={unavailable || overLimit ? "status" : undefined}
        >
          {stockLabel}
        </p>
      </div>
      <div className="cart-item-side">
        <strong className="cart-item-price">
          {money(offerPrice(offer, item.choices) * item.quantity)}
        </strong>
        {unavailable ? (
          <button
            type="button"
            className="cart-remove"
            onClick={() => onRemove(item.key)}
            aria-label={`Eliminar ${offer.name} del carrito`}
          >
            Eliminar
          </button>
        ) : (
          <div className="quantity">
            <button
              type="button"
              onClick={() => onQuantity(item.key, -1)}
              aria-label={`Quitar una unidad de ${offer.name}`}
            >
              <Minus size={18} />
            </button>
            <span>{item.quantity}</span>
            <button
              type="button"
              onClick={() => onQuantity(item.key, 1)}
              disabled={item.quantity >= Math.min(10, offer.remaining)}
              aria-label={`Agregar una unidad de ${offer.name}`}
            >
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function OfferingCard({
  offer,
  kitchen,
  highlight,
  onChoose,
  onKitchen,
}: {
  offer: Offering;
  kitchen?: Kitchen;
  highlight?: string;
  onChoose: (offer: Offering) => void;
  onKitchen: (id: string) => void;
}) {
  const today = limaToday();
  const soldOutBeforePickup =
    offer.remaining <= 0 &&
    (offer.date > today ||
      (offer.date === today && offer.pickupUntil > limaTime()));
  return (
    <article className="offer-card">
      <div className="offer-photo">
        <img src={offer.imageUrl} alt={offer.imageAlt} loading="lazy" />
        {highlight && (
          <span className="offer-highlight">
            <Star size={14} fill="currentColor" aria-hidden="true" />
            {highlight}
          </span>
        )}
        {kitchen?.logoUrl && (
          <img
            className="offer-logo"
            src={kitchen.logoUrl}
            alt={`Logo de ${kitchen.name}`}
            loading="lazy"
          />
        )}
        <span className="offer-pickup">
          <BrandCalendarIcon size={16} inverse />
          <span>Recojo · {pickupDateTime(offer)}</span>
        </span>
      </div>
      <div className="offer-info">
        <div className="offer-topline">
          <button
            type="button"
            className="offer-kitchen"
            onClick={() => onKitchen(offer.kitchenId)}
          >
            Cocina: {offer.kitchenName}
          </button>
          {offer.customization.length > 0 && (
            <span className="custom-badge">
              <SlidersHorizontal size={14} /> Personalizable
            </span>
          )}
        </div>
        <h3>{offer.name}</h3>
        <p>{offer.description}</p>
        <div className="offer-timing">
          <div>
            <BrandClockIcon size={17} />
            <span>
              <strong>Reserva hasta</strong>
              <small>
                {capitalizeFirst(bookingDeadlineLabel(offer.bookingDeadline))}
              </small>
            </span>
          </div>
        </div>
        <div className="offer-bottom">
          <strong>{money(offer.priceSoles)}</strong>
          <Button onClick={() => onChoose(offer)} disabled={!offer.bookable}>
            {offer.bookable
              ? "Agregar"
              : offer.remaining < 1
                ? "Agotado"
                : "Cerrado"}
            {offer.bookable && <ArrowRight size={17} />}
          </Button>
        </div>
        <span
          className={`offer-stock${soldOutBeforePickup ? " offer-stock-soldout" : ""}`}
        >
          {soldOutBeforePickup
            ? "¡Sold out!"
            : offer.bookable
              ? `${offer.remaining} ${offer.remaining === 1 ? "porción disponible" : "porciones disponibles"}`
              : ""}
        </span>
      </div>
    </article>
  );
}

function CareerPicker({
  careers,
  value,
  onChange,
  invalid,
  triggerRef,
}: {
  careers: string[];
  value: string;
  onChange: (career: string) => void;
  invalid: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (open) optionRefs.current[Math.max(0, careers.indexOf(value))]?.focus();
  }, [open, careers, value]);
  const focusOption = (index: number) =>
    optionRefs.current[(index + careers.length) % careers.length]?.focus();
  return (
    <div
      className="career-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <span className="career-picker-label" id="career-label">
        Carrera
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="career-picker-trigger"
        role="combobox"
        aria-labelledby="career-label career-value"
        aria-controls="career-options"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "auth-error-toast" : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span id="career-value" className={value ? "" : "placeholder"}>
          {value || "Selecciona tu carrera"}
        </span>
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="career-picker-options"
          id="career-options"
          role="listbox"
          aria-labelledby="career-label"
        >
          {careers.map((item, index) => (
            <button
              key={item}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === item}
              onClick={() => {
                onChange(item);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusOption(careers.length - 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <span>{item}</span>
              {value === item && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthPanel({
  careers = [],
  message,
  onAuthenticated,
}: {
  careers?: string[];
  message: string;
  onAuthenticated: () => Promise<void>;
}) {
  const [step, setStep] = useState<"google" | "register">("google");
  const [googleEmail, setGoogleEmail] = useState("");
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [career, setCareer] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [careerInvalid, setCareerInvalid] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const careerTriggerRef = useRef<HTMLButtonElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const scriptId = "google-jssdk";
    const initGsi = () => {
      const g = (
        window as unknown as {
          google?: {
            accounts?: { id?: { initialize: (config: unknown) => void } };
          };
        }
      ).google;
      if (g?.accounts?.id) {
        g.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential?: string }) => {
            if (response.credential) {
              await authenticateWithGoogle({ credential: response.credential });
            }
          },
          hosted_domain: "utec.edu.pe",
        });
      }
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGsi;
      document.body.appendChild(script);
    } else {
      initGsi();
    }
  }, []);

  useEffect(() => {
    if (showPrompt) {
      promptInputRef.current?.focus();
    }
  }, [showPrompt]);

  useEffect(() => {
    if (step === "register") {
      nameRef.current?.focus();
    }
  }, [step]);

  async function authenticateWithGoogle(payload: {
    credential?: string;
    email?: string;
    name?: string;
    studentCode?: string;
    career?: string;
    birthDate?: string | null;
  }) {
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        status: "authenticated" | "needs_registration";
        email?: string;
        name?: string;
        user?: User;
      }>("/api/auth/google", payload);

      if (res.status === "needs_registration") {
        setGoogleEmail(res.email || payload.email || "");
        setName(res.name || payload.name || "");
        setStep("register");
        setShowPrompt(false);
      } else {
        await onAuthenticated();
        setShowPrompt(false);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos acceder con Google.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleClick() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const g = (
      window as unknown as {
        google?: { accounts?: { id?: { prompt: () => void } } };
      }
    ).google;
    if (clientId && g?.accounts?.id) {
      g.accounts.id.prompt();
    } else {
      setShowPrompt(true);
    }
  }

  function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail.endsWith("@utec.edu.pe")) {
      setError("Usa un correo institucional que termine en @utec.edu.pe");
      return;
    }
    authenticateWithGoogle({
      email: cleanEmail,
      name: nameInput.trim() || undefined,
    });
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!career) {
      setCareerInvalid(true);
      setError("Selecciona tu carrera.");
      careerTriggerRef.current?.focus();
      return;
    }
    await authenticateWithGoogle({
      email: googleEmail,
      name: name.trim(),
      studentCode: studentCode.trim(),
      career,
      birthDate: birthDate || null,
    });
  }

  return (
    <div
      className={`auth-layout${step === "register" ? " auth-layout-details" : ""}`}
    >
      <div className="auth-side">
        <div className="page-heading">
          <span className="eyebrow">
            {step === "register" ? "COMPLETA TU REGISTRO" : "TU ESPACIO"}
          </span>
          <h1>{step === "register" ? "Tus datos UTEC" : "Mi cuenta"}</h1>
        </div>
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="auth-card">
        {step === "google" ? (
          <div className="auth-google-wrapper">
            <div className="auth-card-badge">
              <span className="auth-badge-dot" />
              <span>Acceso institucional UTEC</span>
            </div>

            <div className="auth-google-header">
              <h2 className="auth-google-title">Acceso único con Google</h2>
              <p className="auth-google-desc">
                Ingresa con tu cuenta de Google <strong>@utec.edu.pe</strong>{" "}
                para acceder a Menúu.
              </p>
            </div>

            <button
              type="button"
              className="google-auth-button"
              onClick={handleGoogleClick}
              disabled={busy}
            >
              <BrandGoogleIcon size={22} />
              <span>
                {busy ? "Verificando cuenta…" : "Continuar con Google"}
              </span>
            </button>

            <div className="auth-security-notice">
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <strong>Acceso exclusivo para la comunidad UTEC.</strong>
                <p>
                  Si ya tienes una cuenta registrada entrarás de inmediato; de
                  lo contrario, completarás tus datos de estudiante para
                  crearla.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="auth-register-wrapper">
            <div className="auth-register-header">
              <div className="auth-google-account-badge">
                <BrandGoogleIcon size={16} />
                <span>{googleEmail}</span>
              </div>
              <p className="auth-google-desc">
                Tu cuenta Google está verificada. Completa tus datos de
                estudiante para finalizar tu registro.
              </p>
            </div>

            <form onSubmit={handleRegisterSubmit}>
              <div className="auth-details-fields">
                <label>
                  Nombre completo
                  <input
                    ref={nameRef}
                    type="text"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    placeholder="¿Cómo te llamas?"
                  />
                </label>
                <label>
                  Código de estudiante
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    minLength={9}
                    maxLength={9}
                    pattern="[0-9]{9}"
                    title="Usa los 9 dígitos de tu código"
                    required
                    value={studentCode}
                    onChange={(event) => {
                      setStudentCode(event.target.value.replace(/\D/g, ""));
                      setError("");
                    }}
                    placeholder="9 dígitos"
                    spellCheck={false}
                  />
                </label>
                <CareerPicker
                  careers={careers}
                  value={career}
                  onChange={(choice) => {
                    setCareer(choice);
                    setCareerInvalid(false);
                    setError("");
                  }}
                  invalid={careerInvalid}
                  triggerRef={careerTriggerRef}
                />
                <BirthDatePicker
                  value={birthDate}
                  onChange={setBirthDate}
                  maxDate={limaToday()}
                />
              </div>

              <div className="auth-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep("google");
                    setError("");
                    setCareerInvalid(false);
                  }}
                  disabled={busy}
                >
                  Volver
                </Button>
                <Button type="submit" disabled={busy}>
                  <span>{busy ? "Creando cuenta…" : "Crear mi cuenta"}</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
      <div className="auth-role-link">
        <span>¿Tienes una cocina?</span>
        <a href={routes.cocina}>
          Inicia sesión como cocina <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <figure className="auth-photo">
        <img
          src="/images/utec-students-account.png"
          alt="Dos estudiantes con prendas UTEC en el campus; imagen referencial"
          width="1024"
          height="1536"
          decoding="async"
        />
        <figcaption>Imagen referencial</figcaption>
      </figure>

      {showPrompt && (
        <div
          className="google-prompt-backdrop"
          onClick={() => !busy && setShowPrompt(false)}
        >
          <div
            className="google-prompt-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="google-dialog-header">
              <div className="google-dialog-brand">
                <BrandGoogleIcon size={26} />
                <div className="google-dialog-titles">
                  <h3 id="google-dialog-title">Acceder con Google</h3>
                  <span>Cuenta institucional UTEC</span>
                </div>
              </div>
              <button
                type="button"
                className="google-dialog-close"
                onClick={() => setShowPrompt(false)}
                aria-label="Cerrar diálogo"
                disabled={busy}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePromptSubmit} className="google-dialog-form">
              <label>
                Correo institucional (@utec.edu.pe)
                <input
                  ref={promptInputRef}
                  type="email"
                  required
                  pattern="[^\s@]+@utec\.edu\.pe"
                  title="Usa un correo @utec.edu.pe"
                  placeholder="tu.nombre@utec.edu.pe"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setError("");
                  }}
                  autoFocus
                />
              </label>

              <label>
                Nombre completo (opcional)
                <input
                  type="text"
                  placeholder="Tu nombre y apellido"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </label>

              <div className="google-quick-accounts">
                <span className="google-quick-label">
                  Cuentas rápidas de prueba:
                </span>
                <div className="google-quick-chips">
                  <button
                    type="button"
                    className="google-chip"
                    onClick={() => {
                      setEmailInput("alumno@utec.edu.pe");
                      setNameInput("Alumno UTEC");
                    }}
                  >
                    alumno@utec.edu.pe
                  </button>
                  <button
                    type="button"
                    className="google-chip"
                    onClick={() => {
                      setEmailInput("estudiante.demo@utec.edu.pe");
                      setNameInput("Estudiante Demo");
                    }}
                  >
                    estudiante.demo@utec.edu.pe
                  </button>
                </div>
              </div>

              <div className="google-dialog-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowPrompt(false)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  <span>{busy ? "Accediendo…" : "Continuar con Google"}</span>
                  <ArrowRight size={18} />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <AuthErrorToast message={error} onClose={() => setError("")} />}
    </div>
  );
}

function KitchenAccess({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function invalid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    if (field !== event.currentTarget.querySelector("input:invalid")) return;
    setError(
      field.type === "email"
        ? field.validity.valueMissing
          ? "Ingresa el correo de tu cocina."
          : "Revisa el formato del correo."
        : "Ingresa tu contraseña.",
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { email, password, role: "kitchen" });
      await onAuthenticated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-section narrow auth-page kitchen-access">
      <div className="page-heading">
        <span className="eyebrow">ACCESO DE COCINAS</span>
        <h1>Entra a tu cocina</h1>
      </div>
      <div className="kitchen-access-layout">
        <div className="kitchen-access-card">
          <div className="kitchen-access-header">
            <span>Iniciar sesión</span>
          </div>
          <form onSubmit={submit} onInvalidCapture={invalid}>
            <label>
              Correo de la cocina
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="cocina@correo.com"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder="Tu contraseña"
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Un momento…" : "Entrar como cocina"}{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
        </div>
        <figure className="kitchen-access-photo">
          <img
            src="/images/kitchen-access-home.png"
            alt="Mujer preparando verduras en una cocina casera"
            width="1024"
            height="1536"
            decoding="async"
          />
          <figcaption>Imagen referencial</figcaption>
        </figure>
      </div>
      <a className="kitchen-back-link" href={routes.cuenta}>
        Soy estudiante <ArrowRight size={16} aria-hidden="true" />
      </a>
      {error && (
        <AuthErrorToast message={error} kitchen onClose={() => setError("")} />
      )}
    </section>
  );
}

function AccountProfile({
  user,
  careers,
  onSaved,
  onLogout,
}: {
  user: User;
  careers: string[];
  onSaved: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [studentCode, setStudentCode] = useState(user.studentCode || "");
  const [career, setCareer] = useState(user.career || "");
  const [birthDate, setBirthDate] = useState(user.birthDate || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [careerInvalid, setCareerInvalid] = useState(false);
  const careerTriggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const today = limaToday();
  const changed =
    name.trim() !== user.name ||
    studentCode.trim() !== (user.studentCode || "") ||
    career !== (user.career || "") ||
    birthDate !== (user.birthDate || "");
  const legacyStudentCode =
    !!user.studentCode && !/^[0-9]{9}$/.test(user.studentCode);
  const birthDateLabel = user.birthDate
    ? birthDateDisplay(user.birthDate)
    : "Sin registrar";

  useEffect(() => {
    setName(user.name);
    setStudentCode(user.studentCode || "");
    setCareer(user.career || "");
    setBirthDate(user.birthDate || "");
  }, [user.name, user.studentCode, user.career, user.birthDate]);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  function cancelChanges() {
    setName(user.name);
    setStudentCode(user.studentCode || "");
    setCareer(user.career || "");
    setBirthDate(user.birthDate || "");
    setCareerInvalid(false);
    setError("");
    setSuccess("");
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!career) {
      setCareerInvalid(true);
      careerTriggerRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/account/profile", {
        name,
        studentCode,
        career,
        birthDate: birthDate || null,
      });
      await onSaved();
      setSuccess("Perfil actualizado.");
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar tu perfil.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-panel">
      <div className="account-intro">
        <div>
          <span className="eyebrow">CORREO UTEC</span>
          <p>{user.email}</p>
        </div>
        <Button variant="quiet" onClick={onLogout}>
          <BrandLogoutIcon size={18} /> Cerrar sesión
        </Button>
      </div>
      {success && (
        <p className="account-success" role="status">
          <Check size={18} aria-hidden="true" /> {success}
        </p>
      )}
      {editing ? (
        <form className="account-form" onSubmit={save}>
          <label>
            Nombre completo
            <input
              ref={nameInputRef}
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Código de estudiante
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              minLength={9}
              maxLength={9}
              pattern="[0-9]{9}"
              title="Usa los 9 dígitos de tu código"
              required
              value={studentCode}
              onChange={(event) => {
                setStudentCode(event.target.value.replace(/\D/g, ""));
                setSuccess("");
              }}
              spellCheck={false}
            />
            {legacyStudentCode && (
              <small className="account-field-help">
                Actualiza tu código a 9 dígitos para guardar cambios.
              </small>
            )}
          </label>
          <CareerPicker
            careers={careers}
            value={career}
            onChange={(choice) => {
              setCareer(choice);
              setCareerInvalid(false);
            }}
            invalid={careerInvalid}
            triggerRef={careerTriggerRef}
          />
          <BirthDatePicker
            value={birthDate}
            onChange={setBirthDate}
            maxDate={today}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="account-form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelChanges}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !changed}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="account-details">
          <div className="account-detail">
            <dt>Nombre completo</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="account-detail">
            <dt>Código de estudiante</dt>
            <dd>{user.studentCode || "Sin registrar"}</dd>
            {legacyStudentCode && (
              <small className="account-field-help">
                Actualiza tu código a 9 dígitos para guardar cambios.
              </small>
            )}
          </div>
          <div className="account-detail account-detail-career">
            <dt>Carrera</dt>
            <dd>{user.career || "Sin registrar"}</dd>
          </div>
          <div className="account-detail account-detail-date">
            <dt className="account-field-label">
              Fecha de nacimiento{" "}
              <span className="account-optional">Opcional</span>
            </dt>
            <dd className={user.birthDate ? "has-value" : undefined}>
              {birthDateLabel}
            </dd>
          </div>
          <div className="account-form-actions">
            <Button
              type="button"
              onClick={() => {
                setSuccess("");
                setEditing(true);
              }}
            >
              Editar
            </Button>
          </div>
        </dl>
      )}
    </div>
  );
}

type FeaturedSlide = {
  kitchen: Kitchen;
  offer: Offering;
  titleLines: [string, string];
  subtitle: string | null;
  descriptionLines: [string, string];
};

function FeaturedCarousel({
  slides,
  onKitchen,
}: {
  slides: FeaturedSlide[];
  onKitchen: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduceMotion(media.matches);
    const onVisibility = () => setVisible(!document.hidden);
    media.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (slides.length < 2 || hovered || focused || !visible || reduceMotion)
      return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % slides.length),
      5000,
    );
    return () => window.clearTimeout(timer);
  }, [index, slides.length, hovered, focused, visible, reduceMotion]);
  const slide = slides[index % slides.length];
  if (!slide) return null;
  return (
    <div
      className="featured-carousel-shell"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <section
        className={`welcome featured-slide ${index % 2 === 1 ? "featured-slide-green" : ""}`}
        aria-label="Comidas destacadas"
      >
        <div
          className="welcome-copy"
          key={slide.offer.id}
          aria-live={hovered || focused ? "polite" : "off"}
        >
          <span className="eyebrow">
            ANTOJO DESTACADO · {slide.kitchen.name}
          </span>
          <h1>
            {slide.titleLines.map((line, lineIndex) => (
              <span className="featured-text-line" key={lineIndex}>
                {line}
              </span>
            ))}
          </h1>
          <h3>
            {slide.subtitle && (
              <span className="featured-text-line">{slide.subtitle}</span>
            )}
          </h3>
          <p>
            {slide.descriptionLines.map((line, lineIndex) => (
              <span className="featured-text-line" key={lineIndex}>
                {line}
              </span>
            ))}
          </p>
          <Button onClick={() => onKitchen(slide.kitchen.id)}>
            Ver cocina <ArrowRight size={19} />
          </Button>
        </div>
        <div className="welcome-photo">
          {slides.map((item, slideIndex) => (
            <div
              className={`featured-visual ${slideIndex === index ? "active" : ""}`}
              key={item.offer.id}
              aria-hidden={slideIndex !== index}
            >
              <img
                className="featured-food-photo"
                src={item.offer.imageUrl}
                alt={slideIndex === index ? item.offer.imageAlt : ""}
              />
              <div className="featured-logo-badge">
                <img
                  src={item.kitchen.logoUrl}
                  alt={
                    slideIndex === index ? `Logo de ${item.kitchen.name}` : ""
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      {slides.length > 1 && (
        <div
          className="featured-arrows"
          role="group"
          aria-label="Cambiar comida destacada"
        >
          <button
            type="button"
            className="featured-arrow featured-arrow-prev"
            onClick={() =>
              setIndex(
                (current) => (current + slides.length - 1) % slides.length,
              )
            }
            aria-label="Ver comida anterior"
          >
            <ChevronLeft size={23} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="featured-arrow featured-arrow-next"
            onClick={() => setIndex((current) => (current + 1) % slides.length)}
            aria-label="Ver siguiente comida"
          >
            <ChevronRight size={23} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    pageFromHash(window.location.hash),
  );
  const [kitchenFilter, setKitchenFilter] = useState<string | null>(() =>
    kitchenFromHash(window.location.hash),
  );
  const [state, setState] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [week, setWeek] = useState(0);
  const [dayFilter, setDayFilter] = useState<number | null>(() =>
    limaDayIndex(),
  );
  const [pickupFilter, setPickupFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Offering | null>(null);
  const [dataNotice, setDataNotice] = useState<"consumer" | "kitchen" | null>(
    null,
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const bookingKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  async function refresh() {
    const data = await api<Bootstrap>("/api/bootstrap");
    setState(data);
    setLoadError("");
    setSelected((current) =>
      current
        ? data.catalog.offerings.find((offer) => offer.id === current.id) ||
          null
        : null,
    );
  }
  useEffect(() => {
    refresh().catch((cause) =>
      setLoadError(
        cause instanceof Error ? cause.message : "No pudimos cargar el menú.",
      ),
    );
  }, []);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) refresh().catch(() => {});
    };
    if (page === "carrito") update();
    const timer = window.setInterval(
      update,
      page === "carrito" ? 10_000 : 30_000,
    );
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [page]);
  useEffect(() => {
    const syncRoute = () => {
      setPage(pageFromHash(window.location.hash));
      setKitchenFilter(kitchenFromHash(window.location.hash));
      setSelected(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);
  useEffect(() => {
    if (state?.user?.role === "kitchen" && !kitchenPages.includes(page)) {
      window.history.replaceState(null, "", routes.cocinaCuenta);
      setPage("cocinaCuenta");
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [state?.user?.role, page]);

  const offers = state?.catalog.offerings || [];
  const kitchens = state?.catalog.kitchens || [];
  const activeKitchen = kitchens.find(
    (kitchen) => kitchen.id === kitchenFilter,
  );
  const sales = state?.catalog.sales || [];
  const soldUnits = sales.reduce((sum, row) => sum + row.units, 0);
  const kitchenSales = new Map<string, number>();
  for (const row of sales)
    kitchenSales.set(
      row.kitchenId,
      (kitchenSales.get(row.kitchenId) || 0) + row.units,
    );
  const featuredWeek = offers.some(
    (offer) => offer.week === 0 && offer.bookable,
  )
    ? 0
    : 1;
  const featuredWeekName =
    featuredWeek === 0 ? "esta semana" : "la próxima semana";
  const featuredSales = (state?.catalog.weeklyDishSales || []).filter(
    (row) => row.week === featuredWeek,
  );
  const featuredSalesByDish = new Map(
    featuredSales.map((row) => [`${row.kitchenId}:${row.dishId}`, row]),
  );
  const dishCandidates = new Map<string, Offering>();
  for (const offer of offers
    .filter((offer) => offer.week === featuredWeek && offer.bookable)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder,
    )) {
    const key = `${offer.kitchenId}:${offer.dishId}`;
    if (!dishCandidates.has(key)) dishCandidates.set(key, offer);
  }
  const uniqueDishes = [...dishCandidates.values()];
  const weeklyScore = (offer: Offering) =>
    featuredSalesByDish.get(`${offer.kitchenId}:${offer.dishId}`);
  const hasWeeklyBookings = uniqueDishes.some(
    (offer) => (weeklyScore(offer)?.units || 0) > 0,
  );
  const rankedDishes = [...uniqueDishes].sort(
    (a, b) =>
      (weeklyScore(b)?.units || 0) - (weeklyScore(a)?.units || 0) ||
      (weeklyScore(b)?.orderCount || 0) - (weeklyScore(a)?.orderCount || 0) ||
      a.date.localeCompare(b.date) ||
      a.sortOrder - b.sortOrder,
  );
  const topDishes = hasWeeklyBookings
    ? rankedDishes.slice(0, 3)
    : kitchens
        .map((kitchen) =>
          rankedDishes.find((offer) => offer.kitchenId === kitchen.id),
        )
        .filter((offer): offer is Offering => Boolean(offer))
        .slice(0, 3);
  const topKitchens = [...kitchens]
    .filter(
      (kitchen) => soldUnits === 0 || (kitchenSales.get(kitchen.id) || 0) > 0,
    )
    .sort(
      (a, b) =>
        (kitchenSales.get(b.id) || 0) - (kitchenSales.get(a.id) || 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);
  const featured: FeaturedSlide[] = rankedDishes
    .filter((offer) => Boolean(offer.imageUrl))
    .slice(0, 2)
    .flatMap((offer) => {
      const nameOverflow = offer.name.length > 7;
      const kitchen = kitchens.find((value) => value.id === offer.kitchenId);
      if (!kitchen) return [];
      return [
        {
          kitchen,
          offer,
          titleLines: nameOverflow
            ? ["¿Te apetece comer", `sabroso esta semana?`]
            : ["¿Te apetece", `${offer.name} esta semana?`],
          subtitle: nameOverflow ? `Plato: ${offer.name}` : null,
          descriptionLines: [
            offer.description || `Un plato de ${kitchen.name}.`,
            "Mira el menú y elige tu día.",
          ],
        },
      ];
    });
  const selectedDate =
    state && dayFilter !== null
      ? weekDate(state.catalog.weeks[week], dayFilter)
      : null;
  const pickupOptions = [
    ...new Map<string, PickupOption>(
      offers
        .filter((offer) => offer.week === week)
        .map((offer) => [
          `${offer.deliveryTime}|${offer.pickupUntil}`,
          {
            key: `${offer.deliveryTime}|${offer.pickupUntil}`,
            start: offer.deliveryTime,
            end: offer.pickupUntil,
          },
        ]),
    ).values(),
  ].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  const visible = offers.filter(
    (offer) =>
      offer.week === week &&
      (selectedDate === null || offer.date === selectedDate) &&
      (!kitchenFilter || offer.kitchenId === kitchenFilter) &&
      (!pickupFilter ||
        `${offer.deliveryTime}|${offer.pickupUntil}` === pickupFilter) &&
      `${offer.name} ${offer.description} ${offer.kitchenName}`
        .toLocaleLowerCase("es")
        .includes(query.toLocaleLowerCase("es").trim()),
  );
  const cartRows = useMemo(
    () =>
      cart
        .map((item) => ({
          item,
          offer: offers.find((offer) => offer.id === item.offeringId),
        }))
        .filter((row): row is { item: CartItem; offer: Offering } =>
          Boolean(row.offer),
        ),
    [cart, offers],
  );
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartRows.reduce(
    (sum, { item, offer }) =>
      sum + offerPrice(offer, item.choices) * item.quantity,
    0,
  );

  function go(next: Page) {
    if (window.location.hash !== routes[next])
      window.history.pushState(null, "", routes[next]);
    setPage(next);
    setKitchenFilter(null);
    setSelected(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function goKitchen(id: string) {
    const route = `#menu/cocina/${id}`;
    if (window.location.hash !== route)
      window.history.pushState(null, "", route);
    setPage("buscar");
    setKitchenFilter(id);
    setWeek(0);
    setDayFilter(null);
    setPickupFilter(null);
    setQuery("");
    setSelected(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function filterKitchen(id: string | null) {
    const route = id ? `#menu/cocina/${id}` : "#menu";
    if (window.location.hash !== route)
      window.history.pushState(null, "", route);
    setKitchenFilter(id);
    setPickupFilter(null);
  }
  function changeWeek(next: number) {
    setWeek(next);
    setDayFilter(next === 0 ? limaDayIndex() : null);
    setPickupFilter(null);
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, next: Page) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    go(next);
  }
  function choose(offer: Offering) {
    setSelected(offer);
  }
  function addToCart(
    offer: Offering,
    choices: SelectedChoices,
    rawComment: string,
  ) {
    bookingKeyRef.current = null;
    const selectedChoices = Object.fromEntries(
      offer.customization
        .map((group) => [
          group.id,
          group.choices
            .filter((choice) => choices[group.id]?.includes(choice.id))
            .map((choice) => choice.id),
        ])
        .filter(([, ids]) => ids.length > 0),
    );
    const comment = rawComment.trim().replace(/\s+/g, " ");
    const key = JSON.stringify([offer.id, selectedChoices, comment]);
    setCart((current) => {
      const found = current.find((item) => item.key === key);
      return found
        ? current.map((item) =>
            item.key === key
              ? {
                  ...item,
                  quantity: Math.min(10, offer.remaining, item.quantity + 1),
                }
              : item,
          )
        : [
            ...current,
            {
              key,
              offeringId: offer.id,
              choices: selectedChoices,
              comment,
              quantity: 1,
            },
          ];
    });
    setSelected(null);
  }
  function quantity(key: string, delta: number) {
    bookingKeyRef.current = null;
    setCart((current) =>
      current
        .map((item) =>
          item.key === key
            ? {
                ...item,
                quantity: Math.max(0, Math.min(10, item.quantity + delta)),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }
  function removeFromCart(key: string) {
    bookingKeyRef.current = null;
    setBookingError("");
    setCart((current) => current.filter((item) => item.key !== key));
  }
  async function submitBooking() {
    if (!state?.user) {
      setAuthMessage("Inicia sesión para confirmar tu reserva.");
      go("cuenta");
      return;
    }
    if (!state.user.bookingAllowed) {
      setBookingError(
        "No puedes confirmar otra reserva mientras tengas un pedido marcado como no recogido.",
      );
      return;
    }
    setBooking(true);
    setBookingError("");
    bookingKeyRef.current ??= window.crypto.randomUUID();
    try {
      const latest = await api<Bootstrap>("/api/bootstrap");
      setState(latest);
      if (
        cartRows.some(({ item }) => {
          const offer = latest.catalog.offerings.find(
            (current) => current.id === item.offeringId,
          );
          return !offer?.bookable || offer.remaining < item.quantity;
        })
      ) {
        setBookingError(
          "La disponibilidad cambió. Ajusta o elimina los platos marcados antes de confirmar.",
        );
        return;
      }
      await api<{ orders: Order[] }>("/api/bookings", {
        requestKey: bookingKeyRef.current,
        items: cartRows.map(({ item, offer }) => ({
          offeringId: item.offeringId,
          choices: Object.fromEntries(
            Object.entries(item.choices).map(([groupId, ids]) => [
              groupId,
              offer.customization.find((group) => group.id === groupId)
                ?.selectionType === "multiple"
                ? ids
                : ids[0],
            ]),
          ),
          comment: item.comment,
          quantity: item.quantity,
        })),
      });
      await refresh();
      bookingKeyRef.current = null;
      setCart([]);
      go("pedidos");
      setNotice("Reserva confirmada");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (cause) {
      setBookingError(
        cause instanceof Error
          ? cause.message
          : "No pudimos confirmar la reserva.",
      );
      await refresh().catch(() => {});
    } finally {
      setBooking(false);
    }
  }
  async function logout() {
    await api("/api/auth/logout", {});
    await refresh();
    go("inicio");
  }
  async function kitchenLogout() {
    await api("/api/auth/logout", {});
    await refresh();
    go("cocina");
  }

  const kitchenSession = state?.user?.role === "kitchen";
  const kitchenArea =
    page === "cocina" || kitchenPages.includes(page) || kitchenSession;
  const kitchenHome: Page = kitchenSession ? "cocinaInicio" : "cocina";
  const kitchenSection: KitchenSection =
    page === "cocinaInicio"
      ? "inicio"
      : page === "cocinaMenu"
        ? "menu"
        : page === "cocinaPlatos"
          ? "platos"
          : page === "cocinaEstadisticas"
            ? "estadisticas"
            : "cuenta";

  return (
    <div className={`app-shell route-${page}`}>
      <a
        className="skip-link"
        href="#contenido"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("contenido")?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <a
            className="brand"
            href={routes[kitchenArea ? kitchenHome : "inicio"]}
            onClick={(event) =>
              follow(event, kitchenArea ? kitchenHome : "inicio")
            }
            aria-label="Menúu, ir al inicio"
          >
            <img src="/images/menuu-logo.png" width="52" height="49" alt="" />
            <span>
              Menú<span className="brand-last-letter">u</span>
            </span>
          </a>
          {kitchenArea ? (
            <nav
              className="desktop-nav kitchen-nav"
              aria-label="Navegación de cocina"
            >
              {kitchenSession ? (
                kitchenNavigation.map(({ id, label }) => (
                  <a
                    key={id}
                    href={routes[id]}
                    aria-current={page === id ? "page" : undefined}
                    onClick={(event) => follow(event, id)}
                  >
                    {label}
                  </a>
                ))
              ) : (
                <a href={routes.cocina} aria-current="page">
                  Acceso de cocina
                </a>
              )}
            </nav>
          ) : (
            <>
              <nav className="desktop-nav" aria-label="Navegación principal">
                {navigation
                  .filter(({ id }) => id !== "carrito")
                  .map(({ id, label }) => (
                    <a
                      key={id}
                      href={routes[id]}
                      aria-current={page === id ? "page" : undefined}
                      onClick={(event) => follow(event, id)}
                    >
                      {label}
                    </a>
                  ))}
              </nav>
              <a
                className="header-cart"
                href={routes.carrito}
                aria-current={page === "carrito" ? "page" : undefined}
                onClick={(event) => follow(event, "carrito")}
                aria-label={`Ver carrito, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
              >
                <BrandCartIcon size={24} />
                {itemCount > 0 && <span>{itemCount}</span>}
              </a>
            </>
          )}
        </div>
      </header>
      <main
        key={page}
        id="contenido"
        tabIndex={-1}
        className={`container main-content${page === "inicio" && itemCount > 0 ? " has-cart-ribbon" : ""}`}
      >
        {loadError && (
          <div className="load-error" role="alert">
            <p>{loadError}</p>
            <Button
              variant="secondary"
              onClick={() =>
                refresh().catch((cause) => setLoadError(cause.message))
              }
            >
              Reintentar
            </Button>
          </div>
        )}
        {!state && !loadError && (
          <div className="loading-state" role="status">
            Cargando Menúu…
          </div>
        )}
        {state &&
          kitchenArea &&
          (kitchenSession ? (
            <KitchenDashboard
              section={kitchenSection}
              user={state.user!}
              onLogout={kitchenLogout}
              onChanged={refresh}
            />
          ) : (
            <KitchenAccess onAuthenticated={refresh} />
          ))}
        {state && !kitchenSession && page === "inicio" && (
          <>
            <div className="location-line">
              <BrandLocationIcon size={22} />
              <span>Punto de encuentro: comedor de la U</span>
            </div>
            {featured.length > 0 && (
              <FeaturedCarousel slides={featured} onKitchen={goKitchen} />
            )}
            <section
              className="home-discovery"
              aria-labelledby="popular-dishes-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    {hasWeeklyBookings ? "LOS MÁS ELEGIDOS" : "PARA DESCUBRIR"}
                  </span>
                  <h2 id="popular-dishes-title">
                    {hasWeeklyBookings
                      ? `Los platos más pedidos de ${featuredWeekName}`
                      : topDishes.length
                        ? `Destacados de ${featuredWeekName}`
                        : "Menús por venir"}
                  </h2>
                  <p>
                    {hasWeeklyBookings
                      ? "Ordenados por porciones reservadas para esos días."
                      : topDishes.length
                        ? "Aún sin reservas para esos días; aquí tienes platos disponibles."
                        : "Aquí aparecerán los platos cuando las cocinas publiquen sus menús."}
                  </p>
                </div>
                <button className="section-link" onClick={() => go("buscar")}>
                  Ver menú completo <ArrowRight size={18} />
                </button>
              </div>
              {topDishes.length ? (
                <div className="product-grid">
                  {topDishes.map((offer, index) => (
                    <OfferingCard
                      key={offer.id}
                      offer={offer}
                      kitchen={kitchens.find(
                        (kitchen) => kitchen.id === offer.kitchenId,
                      )}
                      highlight={
                        (weeklyScore(offer)?.units || 0) > 0
                          ? `N.º ${index + 1} · ${featuredWeekName}`
                          : undefined
                      }
                      onChoose={choose}
                      onKitchen={goKitchen}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<BrandDishIcon size={32} />}
                  title="Aún no hay platos publicados"
                  body="Vuelve pronto para conocer los menús de las cocinas."
                />
              )}
            </section>
            {topKitchens.length > 0 && (
              <section
                className="home-discovery kitchen-discovery"
                aria-labelledby="top-kitchens-title"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">HECHO CERCA DE TU BREAK</span>
                    <h2 id="top-kitchens-title">
                      {soldUnits > 0
                        ? "Cocinas con más pedidos"
                        : "Cocinas para conocer"}
                    </h2>
                    <p>
                      {soldUnits > 0
                        ? "Ordenadas por platos entregados."
                        : "Explora sus menús de esta semana y la siguiente."}
                    </p>
                  </div>
                </div>
                <div className="kitchen-grid">
                  {topKitchens.map((kitchen) => (
                    <button
                      type="button"
                      className="kitchen-card"
                      key={kitchen.id}
                      onClick={() => goKitchen(kitchen.id)}
                    >
                      <img
                        className="kitchen-card-logo"
                        src={kitchen.logoUrl}
                        alt=""
                        loading="lazy"
                      />
                      <span className="kitchen-card-copy">
                        <strong>{kitchen.name}</strong>
                        <span className="kitchen-rating">
                          <Star
                            size={17}
                            strokeWidth={2.6}
                            fill={
                              kitchen.rating === null ? "none" : "currentColor"
                            }
                            aria-hidden="true"
                          />
                          {kitchen.rating === null
                            ? "Aún sin puntuación"
                            : `${kitchen.rating.toFixed(1)} · ${kitchen.ratingCount} ${kitchen.ratingCount === 1 ? "reseña" : "reseñas"}`}
                        </span>
                        <span className="kitchen-card-link">
                          Ver cocina <ArrowRight size={17} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        {state && !kitchenSession && page === "buscar" && (
          <section className="page-section">
            <div className="page-heading">
              <span className="eyebrow">ELIGE TU ANTOJO</span>
              <h1>{activeKitchen ? activeKitchen.name : "Menú semanal"}</h1>
              <p>
                {activeKitchen
                  ? activeKitchen.description
                  : "Revisa los días y la hora de recojo de cada cocina."}
              </p>
            </div>
            {kitchenFilter && !activeKitchen ? (
              <EmptyState
                icon={<BrandStoreIcon size={32} />}
                title="No encontramos esa cocina"
                body="Revisa las cocinas disponibles en el menú."
                action={
                  <Button onClick={() => go("buscar")}>Ver todo el menú</Button>
                }
              />
            ) : (
              <WeekMenu
                state={state}
                week={week}
                setWeek={changeWeek}
                dayFilter={dayFilter}
                setDayFilter={setDayFilter}
                pickupFilter={pickupFilter}
                setPickupFilter={setPickupFilter}
                pickupOptions={pickupOptions}
                kitchenFilter={kitchenFilter}
                onKitchen={(id) => filterKitchen(id)}
                onAllKitchens={() => filterKitchen(null)}
                query={query}
                onQuery={setQuery}
                visible={visible}
                onChoose={choose}
              />
            )}
          </section>
        )}
        {state && !kitchenSession && page === "carrito" && (
          <section className="page-section narrow">
            <div className="page-heading">
              <span className="eyebrow">TU PEDIDO</span>
              <h1>Tu carrito</h1>
              <p>Revisa el cierre de reserva y el recojo de cada plato.</p>
            </div>
            {cartRows.length === 0 ? (
              <EmptyState
                icon={<BrandOrderBagIcon size={32} />}
                title="Tu carrito está vacío"
                body="Elige un plato del menú y aparecerá aquí."
                action={
                  <Button onClick={() => go("buscar")}>
                    Ver menús <ArrowRight size={18} />
                  </Button>
                }
              />
            ) : (
              <div className="cart-layout">
                <div className="cart-items">
                  {cartRows.map(({ item, offer }) => (
                    <CartItemCard
                      key={item.key}
                      item={item}
                      offer={offer}
                      onQuantity={quantity}
                      onRemove={removeFromCart}
                    />
                  ))}
                </div>
                <aside className="cart-summary">
                  <h2>Resumen</h2>
                  <div>
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <p>
                    Recoge cada plato en el comedor durante la ventana indicada.
                  </p>
                  <p>
                    <strong>Pago:</strong> QR al recibir tu comida.
                  </p>
                  {bookingError && (
                    <p className="form-error" role="alert">
                      {bookingError}
                    </p>
                  )}
                  {state.user && !state.user.bookingAllowed && (
                    <p className="form-error" role="status">
                      No puedes reservar mientras tengas un pedido marcado como
                      no recogido.
                    </p>
                  )}
                  <Button
                    onClick={submitBooking}
                    disabled={
                      booking ||
                      state.user?.bookingAllowed === false ||
                      cartRows.some(
                        ({ item, offer }) =>
                          !offer.bookable || offer.remaining < item.quantity,
                      )
                    }
                  >
                    {booking ? "Confirmando…" : "Confirmar reserva"}{" "}
                    <ArrowRight size={18} />
                  </Button>
                  {cartRows.some(
                    ({ item, offer }) =>
                      !offer.bookable || offer.remaining < item.quantity,
                  ) && (
                    <p className="form-error">
                      Hay un plato agotado, una reserva cerrada o más porciones
                      en el carrito que las disponibles. Elimina o ajusta ese
                      plato para continuar.
                    </p>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}
        {state && !kitchenSession && page === "pedidos" && (
          <section className="page-section narrow">
            <div className="page-heading">
              <span className="eyebrow">TUS BREAKS</span>
              <h1>Mis pedidos</h1>
              <p>Guarda tu código y llega puntual al punto de encuentro.</p>
            </div>
            {!state.user ? (
              <EmptyState
                icon={<BrandLockedOrdersIcon size={32} />}
                title="Entra para ver tus pedidos"
                body="Tus reservas están asociadas a tu cuenta UTEC."
                action={
                  <Button onClick={() => go("cuenta")}>
                    Iniciar sesión <ArrowRight size={18} />
                  </Button>
                }
              />
            ) : state.orders.length === 0 ? (
              <EmptyState
                icon={<BrandOrdersIcon size={30} />}
                title="Aún no hay pedidos"
                body="Cuando confirmes tu primer plato, podrás seguirlo aquí."
                action={
                  <Button onClick={() => go("buscar")}>
                    Ver menús <ArrowRight size={18} />
                  </Button>
                }
              />
            ) : (
              <div className="orders-list">
                {state.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onReviewed={refresh}
                  />
                ))}
              </div>
            )}
          </section>
        )}
        {state && !kitchenSession && page === "cuenta" && (
          <section className="page-section narrow auth-page">
            {state.user ? (
              <>
                <div className="page-heading">
                  <span className="eyebrow">TU ESPACIO</span>
                  <h1>Mi cuenta</h1>
                </div>
                <AccountProfile
                  user={state.user}
                  careers={state.careers}
                  onSaved={refresh}
                  onLogout={logout}
                />
              </>
            ) : (
              <AuthPanel
                careers={state.careers}
                message={authMessage}
                onAuthenticated={async () => {
                  await refresh();
                  setAuthMessage("");
                }}
              />
            )}
          </section>
        )}
      </main>
      {!kitchenSession && page === "inicio" && itemCount > 0 && (
        <aside className="cart-ribbon" aria-label="Productos en el carrito">
          <span className="cart-ribbon-icon">
            <BrandCartIcon size={25} inverse />
          </span>
          <div className="cart-ribbon-copy">
            <strong>
              {itemCount}{" "}
              {itemCount === 1 ? "plato en tu carrito" : "platos en tu carrito"}
            </strong>
            <span>Listos para revisar · {money(total)}</span>
          </div>
          <Button variant="secondary" onClick={() => go("carrito")}>
            Ir al carrito <ArrowRight size={18} />
          </Button>
        </aside>
      )}
      <footer className="site-footer">
        <div className="container footer-inner">
          <a
            className="footer-brand"
            href={routes[kitchenArea ? kitchenHome : "inicio"]}
            onClick={(event) =>
              follow(event, kitchenArea ? kitchenHome : "inicio")
            }
            aria-label="Menúu, ir al inicio"
          >
            <img src="/images/menuu-logo.png" width="37" height="35" alt="" />
            <span>
              Menú<span className="brand-last-letter">u</span>
            </span>
          </a>
          <p>Tu antojo tiene punto de encuentro.</p>
          <button
            type="button"
            className="footer-notice-button"
            onClick={() => setDataNotice(kitchenArea ? "kitchen" : "consumer")}
          >
            {kitchenArea
              ? "Datos y piloto para cocinas"
              : "Privacidad y piloto"}
          </button>
        </div>
      </footer>
      {!kitchenArea && (
        <nav className="mobile-nav" aria-label="Navegación principal">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={routes[id]}
              aria-current={page === id ? "page" : undefined}
              onClick={(event) => follow(event, id)}
            >
              <span className="mobile-icon">
                <Icon size={22} strokeWidth={1.9} />
                {id === "carrito" && itemCount > 0 && (
                  <small>{itemCount}</small>
                )}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}
      {kitchenSession && (
        <nav className="mobile-nav" aria-label="Navegación de cocina">
          {kitchenNavigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={routes[id]}
              aria-current={page === id ? "page" : undefined}
              onClick={(event) => follow(event, id)}
            >
              <span className="mobile-icon">
                <Icon size={22} />
              </span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}
      {selected && (
        <CustomizationDialog
          key={selected.id}
          offer={selected}
          onClose={() => setSelected(null)}
          onAdd={addToCart}
        />
      )}
      {dataNotice && (
        <DataNoticeDialog
          kind={dataNotice}
          onClose={() => setDataNotice(null)}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Cerrar aviso">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function WeekMenu({
  state,
  week,
  setWeek,
  dayFilter,
  setDayFilter,
  pickupFilter,
  setPickupFilter,
  pickupOptions,
  kitchenFilter,
  onKitchen,
  onAllKitchens,
  query,
  onQuery,
  visible,
  onChoose,
}: {
  state: Bootstrap;
  week: number;
  setWeek: (week: number) => void;
  dayFilter: number | null;
  setDayFilter: (day: number | null) => void;
  pickupFilter: string | null;
  setPickupFilter: (pickup: string | null) => void;
  pickupOptions: PickupOption[];
  kitchenFilter: string | null;
  onKitchen: (id: string) => void;
  onAllKitchens: () => void;
  query: string;
  onQuery: (query: string) => void;
  visible: Offering[];
  onChoose: (offer: Offering) => void;
}) {
  const weekDays = Array.from({ length: 6 }, (_, index) =>
    weekDate(state.catalog.weeks[week], index),
  );
  const daysWithFood = [...new Set(visible.map((offer) => offer.date))].sort();
  const selectedKitchen = state.catalog.kitchens.find(
    (kitchen) => kitchen.id === kitchenFilter,
  );
  const selectedPickup = pickupOptions.find(
    (option) => option.key === pickupFilter,
  );
  const searchTerm = query.trim();
  function choosePickup(
    value: string | null,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    setPickupFilter(value);
    const picker = event.currentTarget.closest("details");
    picker?.removeAttribute("open");
    picker?.querySelector("summary")?.focus();
  }
  return (
    <>
      <div className="menu-filters">
        <div className="week-tabs" role="group" aria-label="Semana del menú">
          <button
            type="button"
            aria-pressed={week === 0}
            className={week === 0 ? "active" : ""}
            onClick={() => setWeek(0)}
          >
            Esta semana
          </button>
          <button
            type="button"
            aria-pressed={week === 1}
            className={week === 1 ? "active" : ""}
            onClick={() => setWeek(1)}
          >
            Siguiente semana
          </button>
        </div>
        <div className="catalog-search">
          <SearchField
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            aria-label="Buscar platos o cocinas"
          />
        </div>
        <details
          className="kitchen-picker"
          key={kitchenFilter || "all"}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.open = false;
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            aria-label={
              selectedKitchen
                ? `Cocina: ${selectedKitchen.name}`
                : "Todas las cocinas"
            }
          >
            {selectedKitchen ? (
              <img src={selectedKitchen.logoUrl} alt="" />
            ) : (
              <BrandStoreIcon size={20} />
            )}
            <span>{selectedKitchen?.name || "Cocinas"}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div
            className="kitchen-picker-options"
            role="group"
            aria-label="Filtrar por cocina"
          >
            <button
              type="button"
              aria-pressed={!kitchenFilter}
              onClick={onAllKitchens}
            >
              <BrandStoreIcon size={20} />
              Todas las cocinas
            </button>
            {state.catalog.kitchens.map((kitchen) => (
              <button
                type="button"
                key={kitchen.id}
                aria-pressed={kitchenFilter === kitchen.id}
                onClick={() => onKitchen(kitchen.id)}
              >
                <img src={kitchen.logoUrl} alt="" />
                {kitchen.name}
              </button>
            ))}
          </div>
        </details>
        <details
          className="pickup-picker"
          key={week}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.open = false;
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            aria-label={
              selectedPickup
                ? `Recojo: ${pickupWindow(selectedPickup.start, selectedPickup.end)}`
                : "Filtrar por hora de recojo"
            }
          >
            <BrandClockIcon size={19} />
            <span>
              {selectedPickup
                ? pickupWindow(selectedPickup.start, selectedPickup.end)
                : "Hora de recojo"}
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div
            className="pickup-picker-options"
            role="group"
            aria-label="Franja horaria de recojo"
          >
            <button
              type="button"
              aria-pressed={!pickupFilter}
              onClick={(event) => choosePickup(null, event)}
            >
              Cualquier horario
            </button>
            {pickupOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                aria-pressed={pickupFilter === option.key}
                onClick={(event) => choosePickup(option.key, event)}
              >
                {pickupWindow(option.start, option.end)}
              </button>
            ))}
          </div>
        </details>
        <div className="day-filter-group">
          <span className="day-filter-label">Día</span>
          <div
            className="day-filters"
            role="group"
            aria-label="Filtrar menús por día"
          >
            <button
              type="button"
              aria-pressed={dayFilter === null}
              className={dayFilter === null ? "active" : ""}
              onClick={() => setDayFilter(null)}
            >
              Todos
            </button>
            {weekDays.map((date, index) => (
              <button
                type="button"
                key={date}
                aria-pressed={dayFilter === index}
                className={dayFilter === index ? "active" : ""}
                onClick={() => setDayFilter(index)}
              >
                {capitalizeFirst(
                  dateLabel(date, { weekday: "short", day: "numeric" }),
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      {(searchTerm || pickupFilter) && (
        <p className="catalog-search-status" role="status">
          {visible.length} {visible.length === 1 ? "plato" : "platos"}
          {searchTerm ? ` para «${searchTerm}»` : ""}
          {selectedPickup
            ? ` · Recojo ${pickupWindow(selectedPickup.start, selectedPickup.end)}`
            : ""}
        </p>
      )}
      {daysWithFood.length === 0 ? (
        <EmptyState
          icon={<BrandCalendarIcon size={32} />}
          title={
            dayFilter === null
              ? "No hay platos para estos filtros"
              : "No hay platos para este día"
          }
          body="Prueba con otro día, horario o semana, o revisa tu búsqueda."
        />
      ) : (
        daysWithFood.map((date) => {
          const dayOffers = visible.filter((offer) => offer.date === date);
          return (
            <section className="day-group" key={date}>
              <div className="day-heading">
                <h3>{capitalizeFirst(dateLabel(date))}</h3>
                <span>
                  {dayOffers.length}{" "}
                  {dayOffers.length === 1 ? "plato" : "platos"}
                </span>
              </div>
              <div className="product-grid">
                {dayOffers.map((offer) => (
                  <OfferingCard
                    key={offer.id}
                    offer={offer}
                    kitchen={state.catalog.kitchens.find(
                      (kitchen) => kitchen.id === offer.kitchenId,
                    )}
                    onChoose={onChoose}
                    onKitchen={onKitchen}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function RatingInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rating-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"} para ${label}`}
            aria-pressed={value === star}
            disabled={disabled}
            onClick={() => onChange(star)}
          >
            <Star
              size={22}
              fill={star <= value ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <small>{value ? `${value} de 5` : "Elige de 1 a 5"}</small>
    </div>
  );
}

function OrderCard({
  order,
  onReviewed,
}: {
  order: Order;
  onReviewed: () => Promise<void>;
}) {
  const [kitchenRating, setKitchenRating] = useState(0);
  const [foodRatings, setFoodRatings] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const afterDelivery =
    new Date(`${order.date}T${order.deliveryTime}:00-05:00`) <= new Date();
  const canReview =
    order.status === "entregado" &&
    order.reviewEnabled &&
    afterDelivery &&
    order.kitchenRating === null;
  const label =
    order.status === "entregado"
      ? "Entregado"
      : order.status === "no_se_presento"
        ? "No se registró recojo"
        : order.status === "entrega_pendiente"
          ? "Entrega por confirmar"
          : order.status === "cancelado"
            ? "Cancelado"
            : "Reservado";
  const settled = order.status !== "reservado";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api(`/api/orders/${order.id}/review`, {
        kitchenRating,
        foodRatings: order.items.map((item) => ({
          orderItemId: item.id,
          rating: foodRatings[item.id],
        })),
      });
      await onReviewed();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar tu reseña.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <span className="eyebrow">RESERVA {order.code}</span>
          <h2>{order.kitchenName}</h2>
        </div>
        <span className={`order-status ${settled ? "order-status-ended" : ""}`}>
          {settled ? <Clock3 size={16} /> : <Check size={16} />}
          {label}
        </span>
      </div>
      <div className="order-items">
        {order.items.map((item) => (
          <div key={item.id}>
            <span>
              {item.quantity} × {item.name}
              {item.choices.length > 0 && (
                <small>
                  {item.choices.map((choice) => choice.label).join(" · ")}
                </small>
              )}
              {item.comment && <small>Comentario: {item.comment}</small>}
              {item.foodRating !== null && (
                <small>Tu puntuación: {item.foodRating}/5</small>
              )}
            </span>
            <strong>{money(item.totalSoles)}</strong>
          </div>
        ))}
      </div>
      <div className="order-pickup">
        <CalendarDays size={20} />
        <div>
          <strong>Recojo</strong>
          <span>
            {dateLabel(order.date)} ·{" "}
            {pickupWindow(order.deliveryTime, order.pickupUntil)}
          </span>
        </div>
      </div>
      <div className="order-foot">
        <span>{order.payment}</span>
        <strong>Total {money(order.totalSoles)}</strong>
      </div>
      {order.kitchenRating !== null && (
        <p className="review-saved">
          <Star size={17} fill="currentColor" aria-hidden="true" /> Calificaste
          a {order.kitchenName} con {order.kitchenRating}/5.
        </p>
      )}
      {order.status === "entrega_pendiente" && (
        <p className="review-note">
          Tu solicitud está registrada. La entrega aún no ha sido confirmada.
        </p>
      )}
      {order.status === "no_se_presento" && (
        <p className="review-note">
          Delivery registró que no se recogió este pedido.
        </p>
      )}
      {order.status === "entregado" &&
        !order.reviewEnabled &&
        order.kitchenRating === null && (
          <p className="review-note">
            La reseña todavía no está habilitada para este pedido.
          </p>
        )}
      {canReview && (
        <form className="review-form" onSubmit={submit}>
          <h3>¿Cómo estuvo tu break?</h3>
          <p>Califica la cocina y cada plato de este pedido.</p>
          <RatingInput
            label={`Cocina ${order.kitchenName}`}
            value={kitchenRating}
            onChange={setKitchenRating}
            disabled={saving}
          />
          {order.items.map((item) => (
            <RatingInput
              key={item.id}
              label={item.name}
              value={foodRatings[item.id] || 0}
              onChange={(value) =>
                setFoodRatings((current) => ({ ...current, [item.id]: value }))
              }
              disabled={saving}
            />
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={
              saving ||
              kitchenRating === 0 ||
              order.items.some((item) => !foodRatings[item.id])
            }
          >
            {saving ? "Guardando…" : "Enviar reseña"} <ArrowRight size={18} />
          </Button>
        </form>
      )}
    </article>
  );
}
