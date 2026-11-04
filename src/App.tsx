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
  disablePickupNotifications,
  PickupNotifications,
} from "./components/PickupNotifications";
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
  nextBookableDate,
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
import KitchenDashboard, {
  AdminDashboard,
  AdminReviewsDashboard,
  type KitchenSection,
} from "./KitchenDashboard";
import { CustomizationDialog } from "./components/CustomizationDialog";
import { InstallPrompt } from "./components/InstallPrompt";
import { cachedRequest, cachedValue, invalidateCache } from "./data/queryCache";

type SessionData = Pick<Bootstrap, "user" | "careers">;
type OrdersPage = {
  orders: Order[];
  total: number;
  limit: number;
  offset: number;
};

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
  | "cocinaCuenta"
  | "admin"
  | "adminPedidos"
  | "adminComentarios";
type PickupOption = { key: string; start: string; end: string };
const validStudentCode = (code: string) =>
  /^(?:[0-9]{9}|[0-9]{4}PRE[0-9]{7,8}|[0-9]{5}PRE[A-Z]{2}[0-9]{5})$/.test(code);
const studentCodeHelp =
  "Usa 9 dígitos o un código PRE, por ejemplo 20261PREEN01008.";
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
  admin: "#admin",
  adminPedidos: "#admin/pedidos",
  adminComentarios: "#admin/comentarios",
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
    (hash.startsWith("#cocina/")
      ? "cocina"
      : hash.startsWith("#admin/")
        ? "admin"
        : "inicio")
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
  kind: "consumer" | "kitchen" | "admin";
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
      {kind === "admin" ? (
        <>
          <h3>Si administras las entregas</h3>
          <p>
            Tu cuenta permite ver los pedidos de todas las cocinas y registrar
            cupos, altas manuales, entregas, ausencias y pagos. Guardamos quién
            realizó cada cambio y cuándo. También revisamos los comprobantes
            de Yape de las reservas anticipadas.
          </p>
        </>
      ) : kind === "kitchen" ? (
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
            También guardamos tus reservas, opciones elegidas, comentarios,
            comprobantes de Yape y reseñas para mostrarte tus pedidos,
            verificar el pago y gestionar su entrega.
          </p>
          <p>
            Las cantidades reservadas y las reseñas permiten mostrar
            estadísticas a las cocinas y evaluar el funcionamiento del proyecto.
            Tu comentario, estrellas y platos pedidos pueden verse en la página
            de la cocina sin mostrar tu nombre.
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
const emptyCatalog = (): Bootstrap["catalog"] => {
  const today = limaToday();
  const start = weekDate(today, -(limaDayIndex() ?? 6));
  return {
    kitchens: [],
    offerings: [],
    sales: [],
    weeklyDishSales: [],
    weeks: [start, weekDate(start, 7)],
  };
};
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
  const csrf = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("menuu_csrf="))
    ?.slice("menuu_csrf=".length);
  const response = await fetch(
    path,
    data === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
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
  const soldOut = offer.remaining <= 0;
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
              <strong>
                {!offer.bookable && offer.remaining < 1
                  ? "Reserva cerrada"
                  : "Reserva hasta"}
              </strong>
              <small
                className={
                  !offer.bookable && offer.remaining < 1
                    ? "offer-deadline-ended"
                    : undefined
                }
              >
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
        <span className={`offer-stock${soldOut ? " offer-stock-soldout" : ""}`}>
          {soldOut
            ? "¡Sold out!"
            : offer.bookable
              ? `${offer.remaining} ${offer.remaining === 1 ? "porción disponible" : "porciones disponibles"}`
              : offer.remaining > 0
                ? "¡Ve al punto de encuentro! ¡Venta presencial!"
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
  const pickerRef = useRef<HTMLDivElement>(null);
  const mobileSelectRef = useRef<HTMLSelectElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current)
      optionRefs.current[Math.max(0, careers.indexOf(value))]?.focus();
    wasOpen.current = open;
  });
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap);
  }, [open]);
  useEffect(() => {
    if (invalid && window.matchMedia("(max-width: 700px)").matches)
      mobileSelectRef.current?.focus();
  }, [invalid]);
  const focusOption = (index: number) =>
    optionRefs.current[(index + careers.length) % careers.length]?.focus();
  const selectCareer = (career: string) => {
    onChange(career);
    setOpen(false);
    triggerRef.current?.focus();
  };
  return (
    <div
      ref={pickerRef}
      className="career-picker"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
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
        {value && (
          <Check
            className="career-picker-selected"
            size={18}
            aria-hidden="true"
          />
        )}
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      <div className="career-picker-native">
        <select
          ref={mobileSelectRef}
          value={value}
          className={!value ? "career-picker-native-placeholder" : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(false);
          }}
          aria-labelledby="career-label"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "auth-error-toast" : undefined}
        >
          <option value="" disabled>
            Selecciona tu carrera
          </option>
          {careers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="career-picker-native-icons" aria-hidden="true">
          {value && <Check size={18} />}
          <ChevronDown size={19} />
        </span>
      </div>
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
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCareer(item)}
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
  const [googleCredential, setGoogleCredential] = useState("");
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [career, setCareer] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [careerInvalid, setCareerInvalid] = useState(false);
  const careerTriggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const scriptId = "google-jssdk";
    const initGsi = () => {
      const g = (
        window as unknown as {
          google?: {
            accounts?: {
              id?: {
                initialize: (config: unknown) => void;
                renderButton: (element: HTMLElement, options: unknown) => void;
              };
            };
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
          ux_mode: "popup",
        });
        if (googleButtonRef.current) {
          g.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: 320,
          });
        }
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
        if (!payload.credential) {
          throw new Error("No recibimos una credencial válida de Google.");
        }
        setGoogleCredential(payload.credential);
        setGoogleEmail(res.email || payload.email || "");
        setName(res.name || payload.name || "");
        setStep("register");
      } else {
        await onAuthenticated();
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

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!career) {
      setCareerInvalid(true);
      setError("Selecciona tu carrera.");
      careerTriggerRef.current?.focus();
      return;
    }
    await authenticateWithGoogle({
      credential: googleCredential,
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

            <div
              ref={googleButtonRef}
              className="google-auth-button"
              aria-busy={busy}
            />

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
                    name="studentCode"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    minLength={9}
                    maxLength={15}
                    pattern="(?:[0-9]{9}|[0-9]{4}PRE[0-9]{7,8}|[0-9]{5}PRE[A-Z]{2}[0-9]{5})"
                    title={studentCodeHelp}
                    required
                    value={studentCode}
                    onChange={(event) => {
                      setStudentCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^0-9A-Z]/g, ""),
                      );
                      setError("");
                    }}
                    placeholder="9 dígitos o PRE"
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

      {error && <AuthErrorToast message={error} onClose={() => setError("")} />}
    </div>
  );
}

function KitchenAccess({
  onAuthenticated,
  role = "kitchen",
}: {
  onAuthenticated: () => Promise<void>;
  role?: "kitchen" | "admin";
}) {
  const admin = role === "admin";
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
          ? admin
            ? "Ingresa el correo de admin."
            : "Ingresa el correo de tu cocina."
          : "Revisa el formato del correo."
        : "Ingresa tu contraseña.",
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { email, password, role });
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
        <span className="eyebrow">
          {admin ? "ACCESO ADMIN" : "ACCESO DE COCINAS"}
        </span>
        <h1>{admin ? "Administra las entregas" : "Entra a tu cocina"}</h1>
      </div>
      <div className="kitchen-access-layout">
        <div className="kitchen-access-card">
          <div className="kitchen-access-header">
            <span>Iniciar sesión</span>
          </div>
          <form onSubmit={submit} onInvalidCapture={invalid}>
            <label>
              {admin ? "Correo de admin" : "Correo de la cocina"}
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder={admin ? "admin@correo.com" : "cocina@correo.com"}
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
              {busy
                ? "Un momento…"
                : admin
                  ? "Entrar como admin"
                  : "Entrar como cocina"}{" "}
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
      {!admin && (
        <a className="kitchen-back-link" href={routes.admin}>
          Acceso admin <ArrowRight size={16} aria-hidden="true" />
        </a>
      )}
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
    !!user.studentCode && !validStudentCode(user.studentCode);
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
              name="studentCode"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              minLength={9}
              maxLength={15}
              pattern="(?:[0-9]{9}|[0-9]{4}PRE[0-9]{7,8}|[0-9]{5}PRE[A-Z]{2}[0-9]{5})"
              title={studentCodeHelp}
              required
              value={studentCode}
              onChange={(event) => {
                setStudentCode(
                  event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""),
                );
                setSuccess("");
              }}
              spellCheck={false}
            />
            {legacyStudentCode && (
              <small className="account-field-help">{studentCodeHelp}</small>
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
              <small className="account-field-help">{studentCodeHelp}</small>
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
  descriptionLines: [string, string];
};

function featuredCopy(
  offer: Offering,
  index: number,
): Pick<FeaturedSlide, "titleLines" | "descriptionLines"> {
  const dish = offer.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  if (dish.includes("arroz con pollo"))
    return {
      titleLines: ["Un clásico para", "tu break."],
      descriptionLines: [
        "Arroz con pollo para tu almuerzo.",
        "Elige tu día y reserva tu porción.",
      ],
    };
  if (dish.includes("pure") && dish.includes("milanesa"))
    return {
      titleLines: ["Una pausa rica,", "sin vueltas."],
      descriptionLines: [
        "Puré suave y milanesa dorada.",
        "Haz una pausa rica entre clases.",
      ],
    };
  return index === 0
    ? {
        titleLines: ["Tu break pide", "algo rico."],
        descriptionLines: [
          "Un antojo para cortar la rutina.",
          "Mira el menú y elige tu día.",
        ],
      }
    : {
        titleLines: ["Almorzar rico", "sí se puede."],
        descriptionLines: [
          "Dale sabor a tu pausa en la U.",
          "Conoce la cocina y reserva.",
        ],
      };
}

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
              <span className="featured-dish-label">{item.offer.name}</span>
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
  const [catalogReady, setCatalogReady] = useState(false);
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const ordersRequestRef = useRef(0);
  const catalogRequestRef = useRef(0);
  const [loadError, setLoadError] = useState("");
  const [week, setWeek] = useState(0);
  const [dayFilter, setDayFilter] = useState<number | null>(() =>
    limaDayIndex(),
  );
  const [menuFilterManual, setMenuFilterManual] = useState(false);
  const [pickupFilter, setPickupFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Offering | null>(null);
  const [dataNotice, setDataNotice] = useState<
    "consumer" | "kitchen" | "admin" | null
  >(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const bookingKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [reviewPrompt, setReviewPrompt] = useState<ReviewableOrder | null>(null);
  const [commentsKitchen, setCommentsKitchen] = useState<Kitchen | null>(null);

  async function refresh(force = true) {
    const session = await cachedRequest(
      "session",
      () => api<SessionData>("/api/session"),
      300_000,
      force,
    );
    const needsCatalog =
      ![
        "cuenta",
        "pedidos",
        "cocina",
        "cocinaInicio",
        "cocinaMenu",
        "cocinaPlatos",
        "cocinaEstadisticas",
        "cocinaCuenta",
        "admin",
        "adminPedidos",
        "adminComentarios",
      ].includes(page) &&
      session.user?.role !== "kitchen" &&
      session.user?.role !== "admin";
    const catalog = needsCatalog
      ? await cachedRequest(
          "catalog",
          () => api<Bootstrap["catalog"]>("/api/catalog"),
          60_000,
          force,
        )
      : cachedValue<Bootstrap["catalog"]>("catalog") || emptyCatalog();
    if (needsCatalog || cachedValue("catalog")) setCatalogReady(true);
    setState((current) => ({
      ...session,
      catalog,
      orders:
        current?.user?.id === session.user?.id ? current?.orders || [] : [],
    }));
    if (!session.user || session.user.role !== "consumer") {
      ordersRequestRef.current += 1;
      setOrdersLoaded(false);
      setOrdersLoading(false);
      setOrdersPage(0);
      setOrdersTotal(0);
      invalidateCache("orders:");
    }
    setLoadError("");
    setSelected((current) =>
      current
        ? catalog.offerings.find((offer) => offer.id === current.id) || null
        : null,
    );
  }
  async function refreshCatalog(force = false, freshServer = false) {
    const requestId = ++catalogRequestRef.current;
    const catalog = await cachedRequest(
      "catalog",
      () =>
        api<Bootstrap["catalog"]>(
          freshServer ? "/api/catalog?fresh=1" : "/api/catalog",
        ),
      60_000,
      force,
    );
    if (requestId !== catalogRequestRef.current) return catalog;
    setState((current) => current ? { ...current, catalog } : current);
    setCatalogReady(true);
    setSelected((current) =>
      current
        ? catalog.offerings.find((offer) => offer.id === current.id) || null
        : null,
    );
    return catalog;
  }
  async function refreshSession() {
    invalidateCache("session");
    const session = await cachedRequest(
      "session",
      () => api<SessionData>("/api/session"),
      300_000,
      true,
    );
    setState((current) =>
      current
        ? {
            ...current,
            ...session,
            orders: current.user?.id === session.user?.id ? current.orders : [],
          }
        : current,
    );
    if (!session.user || session.user.role !== "consumer") {
      ordersRequestRef.current += 1;
      invalidateCache("orders:");
      setOrdersLoaded(false);
      setOrdersLoading(false);
      setOrdersPage(0);
      setOrdersTotal(0);
    }
    return session;
  }
  async function loadOrders(targetPage = ordersPage, force = false) {
    const user = state?.user;
    if (!user || user.role !== "consumer") return;
    const requestId = ++ordersRequestRef.current;
    const key = `orders:${user.id}:${targetPage}`;
    const cached = cachedValue<OrdersPage>(key);
    if (!cached) setOrdersLoading(true);
    try {
      const result = await cachedRequest(
        key,
        () => api<OrdersPage>(`/api/orders?limit=10&offset=${targetPage * 10}`),
        30_000,
        force,
      );
      if (requestId !== ordersRequestRef.current) return;
      setState((current) =>
        current?.user?.id === user.id
          ? { ...current, orders: result.orders }
          : current,
      );
      setOrdersTotal(result.total);
      setOrdersLoaded(true);
    } finally {
      if (requestId === ordersRequestRef.current) setOrdersLoading(false);
    }
  }
  useEffect(() => {
    refresh(false).catch((cause) =>
      setLoadError(
        cause instanceof Error ? cause.message : "No pudimos cargar el menú.",
      ),
    );
  }, []);
  useEffect(() => {
    if (state?.user?.role !== "consumer") {
      setReviewPrompt(null);
      return;
    }
    let cancelled = false;
    api<{ review: ReviewableOrder | null }>("/api/reviews/pending")
      .then(({ review }) => {
        if (!review || cancelled) return;
        setReviewPrompt(review);
        api(`/api/orders/${review.orderId}/review-prompt-seen`, {}).catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state?.user?.id, state?.user?.role]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden && ["inicio", "buscar", "carrito"].includes(page))
        refreshCatalog(true, true).catch(() => {});
    };
    update();
    const timer = ["inicio", "buscar", "carrito"].includes(page)
      ? window.setInterval(
          () => {
            if (!document.hidden)
              refreshCatalog(true, page === "carrito").catch(() => {});
          },
          page === "carrito" ? 15_000 : 60_000,
        )
      : null;
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [page]);
  useEffect(() => {
    if (page !== "pedidos" || state?.user?.role !== "consumer") return;
    loadOrders(ordersPage, true).catch((cause) =>
      setLoadError(cause instanceof Error ? cause.message : "No pudimos cargar tus pedidos."));
  }, [page, state?.user?.id, ordersPage]);
  useEffect(() => {
    if (page !== "pedidos" || state?.user?.role !== "consumer") return;
    const update = () => {
      if (!document.hidden) loadOrders(ordersPage, true).catch(() => {});
    };
    const timer = window.setInterval(update, 45_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [page, state?.user?.id, ordersPage]);
  useEffect(() => {
    const syncRoute = () => {
      setPage(pageFromHash(window.location.hash));
      setKitchenFilter(kitchenFromHash(window.location.hash));
      if (pageFromHash(window.location.hash) === "buscar")
        setMenuFilterManual(false);
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
    if (state?.user?.role === "admin" && !["adminPedidos", "adminComentarios"].includes(page)) {
      window.history.replaceState(null, "", routes.adminPedidos);
      setPage("adminPedidos");
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
  const nextMenuDate = nextBookableDate(offers, limaToday());
  const menuOffers = kitchenFilter
    ? offers.filter((offer) => offer.kitchenId === kitchenFilter)
    : offers;
  const nextFilteredMenuDate = nextBookableDate(menuOffers, limaToday());
  const hideCurrentWeek =
    state !== null &&
    !menuOffers.some((offer) => offer.week === 0 && offer.bookable);
  const featuredWeek =
    offers.find((offer) => offer.date === nextMenuDate)?.week ?? 0;
  const featuredWeekName =
    featuredWeek === 0 ? "esta semana" : "la próxima semana";
  const nextMenuDay = nextMenuDate
    ? new Date(`${nextMenuDate}T12:00:00Z`).getUTCDay() - 1
    : null;
  const nextMenuLabel = nextMenuDate
    ? nextMenuDate === limaToday()
      ? "hoy"
      : `el ${dateLabel(nextMenuDate)}`
    : null;
  useEffect(() => {
    if (page !== "buscar" || !state) return;
    if (menuFilterManual && !(hideCurrentWeek && week === 0)) return;
    const targetWeek = nextFilteredMenuDate
      ? Number(nextFilteredMenuDate >= state.catalog.weeks[1])
      : hideCurrentWeek
        ? 1
        : 0;
    const targetDay = nextFilteredMenuDate
      ? new Date(`${nextFilteredMenuDate}T12:00:00Z`).getUTCDay() - 1
      : null;
    if (week !== targetWeek) setWeek(targetWeek);
    if (dayFilter !== targetDay) setDayFilter(targetDay);
    if (pickupFilter) setPickupFilter(null);
  }, [
    page,
    state,
    menuFilterManual,
    hideCurrentWeek,
    week,
    dayFilter,
    pickupFilter,
    nextFilteredMenuDate,
  ]);
  useEffect(() => {
    setMenuFilterManual(false);
  }, [state?.catalog.weeks[0]]);
  const featuredSales = (state?.catalog.weeklyDishSales || []).filter(
    (row) => row.week === featuredWeek,
  );
  const featuredSalesByDish = new Map(
    featuredSales.map((row) => [`${row.kitchenId}:${row.dishId}`, row]),
  );
  const dishCandidates = new Map<string, Offering>();
  for (const offer of offers
    .filter((offer) => offer.date === nextMenuDate && offer.bookable)
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
    : [
        ...kitchens
          .map((kitchen) =>
            rankedDishes.find((offer) => offer.kitchenId === kitchen.id),
          )
          .filter((offer): offer is Offering => Boolean(offer)),
        ...rankedDishes,
      ]
        .filter(
          (offer, index, candidates) =>
            candidates.findIndex((candidate) => candidate.id === offer.id) ===
            index,
        )
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
    .flatMap((offer, index) => {
      const kitchen = kitchens.find((value) => value.id === offer.kitchenId);
      if (!kitchen) return [];
      return [
        {
          kitchen,
          offer,
          ...featuredCopy(offer, index),
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
    if (next === "buscar") setMenuFilterManual(false);
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
    setMenuFilterManual(false);
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
  function goToNextMenu() {
    go("buscar");
    if (nextMenuDate) {
      setWeek(featuredWeek);
      setDayFilter(nextMenuDay);
      setPickupFilter(null);
      setQuery("");
    }
  }
  function goToNextKitchen(id: string) {
    goKitchen(id);
    if (nextMenuDate) {
      setWeek(featuredWeek);
      setDayFilter(nextMenuDay);
    }
  }
  function filterKitchen(id: string | null) {
    const route = id ? `#menu/cocina/${id}` : "#menu";
    if (window.location.hash !== route)
      window.history.pushState(null, "", route);
    setKitchenFilter(id);
    setPickupFilter(null);
  }
  function changeWeek(next: number) {
    setMenuFilterManual(true);
    setWeek(next);
    const firstDate = nextBookableDate(
      menuOffers.filter((offer) => offer.week === next),
      limaToday(),
    );
    setDayFilter(
      firstDate ? new Date(`${firstDate}T12:00:00Z`).getUTCDay() - 1 : null,
    );
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
      const latest = await refreshCatalog(true, true);
      if (
        cartRows.some(({ item }) => {
          const offer = latest.offerings.find(
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
      bookingKeyRef.current = null;
      setCart([]);
      invalidateCache("orders:");
      setOrdersLoaded(false);
      setOrdersPage(0);
      await refreshCatalog(true, true);
      go("pedidos");
      setNotice("Pedido apartado. Completa el pago con Yape.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (cause) {
      setBookingError(
        cause instanceof Error
          ? cause.message
          : "No pudimos confirmar la reserva.",
      );
      await refreshCatalog(true, true).catch(() => {});
    } finally {
      setBooking(false);
    }
  }
  async function logout() {
    await disablePickupNotifications().catch(() => {});
    await api("/api/auth/logout", {});
    invalidateCache();
    setCatalogReady(false);
    await refreshSession();
    go("inicio");
  }
  async function kitchenLogout() {
    await api("/api/auth/logout", {});
    invalidateCache();
    setCatalogReady(false);
    await refreshSession();
    go("cocina");
  }
  async function adminLogout() {
    await api("/api/auth/logout", {});
    invalidateCache();
    setCatalogReady(false);
    await refreshSession();
    go("admin");
  }

  const kitchenSession = state?.user?.role === "kitchen";
  const adminSession = state?.user?.role === "admin";
  const adminArea =
    !kitchenSession &&
    (page === "admin" || page === "adminPedidos" || page === "adminComentarios" || adminSession);
  const kitchenArea =
    !adminSession &&
    (page === "cocina" || kitchenPages.includes(page) || kitchenSession);
  const kitchenHome: Page = kitchenSession ? "cocinaInicio" : "cocina";
  const areaHome: Page = adminArea
    ? adminSession
      ? "adminPedidos"
      : "admin"
    : kitchenArea
      ? kitchenHome
      : "inicio";
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
            href={routes[areaHome]}
            onClick={(event) => follow(event, areaHome)}
            aria-label="Menúu, ir al inicio"
          >
            <img src="/images/menuu-logo.png" width="52" height="49" alt="" />
            <span>
              Menú<span className="brand-last-letter">u</span>
            </span>
          </a>
          {adminArea ? (
            <nav className="desktop-nav" aria-label="Navegación de admin">
              <a
                href={routes[adminSession ? "adminPedidos" : "admin"]}
                aria-current={page === "adminPedidos" ? "page" : undefined}
                onClick={(event) => adminSession && follow(event, "adminPedidos")}
              >
                {adminSession ? "Pedidos y entregas" : "Acceso admin"}
              </a>
              {adminSession && <a href={routes.adminComentarios} aria-current={page === "adminComentarios" ? "page" : undefined} onClick={(event) => follow(event, "adminComentarios")}>Comentarios</a>}
            </nav>
          ) : kitchenArea ? (
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
          !catalogReady &&
          ["inicio", "buscar", "carrito"].includes(page) && (
            <div className="loading-state" role="status">
              Cargando menús…
            </div>
          )}
        {state &&
          kitchenArea &&
          (kitchenSession ? (
            <KitchenDashboard
              section={kitchenSection}
              user={state.user!}
              onLogout={kitchenLogout}
            />
          ) : (
            <KitchenAccess
              onAuthenticated={async () => {
                await refreshSession();
              }}
            />
          ))}
        {state &&
          adminArea &&
          (adminSession ? (
            page === "adminComentarios"
              ? <AdminReviewsDashboard user={state.user!} onLogout={adminLogout} />
              : <AdminDashboard user={state.user!} onLogout={adminLogout} />
          ) : (
            <KitchenAccess
              role="admin"
              onAuthenticated={async () => {
                await refreshSession();
              }}
            />
          ))}
        {state &&
          catalogReady &&
          !kitchenSession &&
          !adminSession &&
          page === "inicio" && (
            <>
              <div className="location-line">
                <BrandLocationIcon size={22} />
                <span>
                  Punto de encuentro: Entrada del Comedor UTEC en piso 2
                </span>
              </div>
              {featured.length > 0 && (
                <FeaturedCarousel
                  slides={featured}
                  onKitchen={goToNextKitchen}
                />
              )}
              <section
                className="home-discovery"
                aria-labelledby="popular-dishes-title"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      {hasWeeklyBookings
                        ? "LOS MÁS ELEGIDOS"
                        : "PARA DESCUBRIR"}
                    </span>
                    <h2 id="popular-dishes-title">
                      {nextMenuLabel
                        ? `Menús para ${nextMenuLabel}`
                        : "Menús por venir"}
                    </h2>
                    <p>
                      {hasWeeklyBookings
                        ? `Ordenados por porciones reservadas de ${featuredWeekName}.`
                        : topDishes.length
                          ? "Estos platos tienen reservas disponibles para ese día."
                          : "Aquí aparecerán los platos cuando las cocinas publiquen sus menús."}
                    </p>
                  </div>
                  <button className="section-link" onClick={goToNextMenu}>
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
                        onKitchen={goToNextKitchen}
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
                                kitchen.rating === null
                                  ? "none"
                                  : "currentColor"
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
        {state &&
          catalogReady &&
          !kitchenSession &&
          !adminSession &&
          page === "buscar" && (
            <section className="page-section">
              <div className={`page-heading${activeKitchen ? " kitchen-menu-heading" : ""}`}>
                <div>
                  <span className="eyebrow">ELIGE TU ANTOJO</span>
                  <h1>{activeKitchen ? activeKitchen.name : "Menú semanal"}</h1>
                  <p>{activeKitchen ? activeKitchen.description : "Revisa los días y la hora de recojo de cada cocina."}</p>
                </div>
                {activeKitchen && <div className="kitchen-menu-reputation">
                  <div className="kitchen-menu-rating"><Star size={21} fill={activeKitchen.rating === null ? "none" : "currentColor"} aria-hidden="true" /><strong>{activeKitchen.rating === null ? "Aún sin puntuación" : `${activeKitchen.rating.toFixed(1)} / 5`}</strong></div>
                  <span>{activeKitchen.ratingCount} {activeKitchen.ratingCount === 1 ? "persona calificó" : "personas calificaron"}</span>
                  <Button type="button" variant="secondary" onClick={() => setCommentsKitchen(activeKitchen)}>Ver últimos comentarios</Button>
                </div>}
              </div>
              {kitchenFilter && !activeKitchen ? (
                <EmptyState
                  icon={<BrandStoreIcon size={32} />}
                  title="No encontramos esa cocina"
                  body="Revisa las cocinas disponibles en el menú."
                  action={
                    <Button onClick={() => go("buscar")}>
                      Ver todo el menú
                    </Button>
                  }
                />
              ) : (
                <WeekMenu
                  state={state}
                  week={week}
                  setWeek={changeWeek}
                  hideCurrentWeek={hideCurrentWeek}
                  dayFilter={dayFilter}
                  setDayFilter={(day) => {
                    setMenuFilterManual(true);
                    setDayFilter(day);
                  }}
                  pickupFilter={pickupFilter}
                  setPickupFilter={(pickup) => {
                    setMenuFilterManual(true);
                    setPickupFilter(pickup);
                  }}
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
        {state &&
          catalogReady &&
          !kitchenSession &&
          !adminSession &&
          page === "carrito" && (
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
                      Recoge cada plato en el comedor durante la ventana
                      indicada.
                    </p>
                    <p>
                      <strong>Pago:</strong> Yape anticipado. Apartaremos las
                      porciones durante 15 minutos para que subas el comprobante.
                    </p>
                    {state.user?.role === "consumer" && (
                      <PickupNotifications userId={state.user.id} />
                    )}
                    {bookingError && (
                      <p className="form-error" role="alert">
                        {bookingError}
                      </p>
                    )}
                    {state.user && !state.user.bookingAllowed && (
                      <p className="form-error" role="status">
                        No puedes reservar mientras tengas un pedido marcado
                        como no recogido.
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
                      {booking ? "Apartando…" : "Continuar al pago"}{" "}
                      <ArrowRight size={18} />
                    </Button>
                    {cartRows.some(
                      ({ item, offer }) =>
                        !offer.bookable || offer.remaining < item.quantity,
                    ) && (
                      <p className="form-error">
                        Hay un plato agotado, una reserva cerrada o más
                        porciones en el carrito que las disponibles. Elimina o
                        ajusta ese plato para continuar.
                      </p>
                    )}
                  </aside>
                </div>
              )}
            </section>
          )}
        {state && !kitchenSession && !adminSession && page === "pedidos" && (
          <section className="page-section narrow">
            <div className="page-heading">
              <span className="eyebrow">TUS BREAKS</span>
              <h1>Mis pedidos</h1>
              <p>Sigue tus reservas, pagos y recojos en un solo lugar.</p>
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
            ) : !ordersLoaded ? (
              <p role="status">
                {ordersLoading
                  ? "Cargando tus pedidos…"
                  : "Actualiza para cargar tus pedidos."}
              </p>
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
                {state.orders.map((order, index) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    showPayment={!order.paymentCheckoutId || state.orders.findIndex((candidate) => candidate.paymentCheckoutId === order.paymentCheckoutId) === index}
                    onReviewed={async () => {
                      invalidateCache("orders:");
                      await Promise.all([
                        loadOrders(ordersPage, true),
                        refreshCatalog(true, true),
                      ]);
                    }}
                  />
                ))}
                {ordersTotal > 10 && (
                  <nav className="orders-pages" aria-label="Páginas de pedidos">
                    <Button
                      variant="secondary"
                      disabled={ordersPage === 0 || ordersLoading}
                      onClick={() => {
                        setOrdersLoaded(false);
                        setOrdersPage(ordersPage - 1);
                      }}
                    >
                      Anterior
                    </Button>
                    <span>
                      Página {ordersPage + 1} de {Math.ceil(ordersTotal / 10)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={
                        (ordersPage + 1) * 10 >= ordersTotal || ordersLoading
                      }
                      onClick={() => {
                        setOrdersLoaded(false);
                        setOrdersPage(ordersPage + 1);
                      }}
                    >
                      Siguiente
                    </Button>
                  </nav>
                )}
              </div>
            )}
          </section>
        )}
        {state && !kitchenSession && !adminSession && page === "cuenta" && (
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
                  onSaved={async () => {
                    await refreshSession();
                  }}
                  onLogout={logout}
                />
              </>
            ) : (
              <AuthPanel
                careers={state.careers}
                message={authMessage}
                onAuthenticated={async () => {
                  await refreshSession();
                  setAuthMessage("");
                }}
              />
            )}
          </section>
        )}
      </main>
      {!kitchenSession &&
        !adminSession &&
        page === "inicio" &&
        itemCount > 0 && (
          <aside className="cart-ribbon" aria-label="Productos en el carrito">
            <span className="cart-ribbon-icon">
              <BrandCartIcon size={25} inverse />
            </span>
            <div className="cart-ribbon-copy">
              <strong>
                {itemCount}{" "}
                {itemCount === 1
                  ? "plato en tu carrito"
                  : "platos en tu carrito"}
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
            href={routes[areaHome]}
            onClick={(event) => follow(event, areaHome)}
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
            onClick={() =>
              setDataNotice(
                adminArea ? "admin" : kitchenArea ? "kitchen" : "consumer",
              )
            }
          >
            {adminArea
              ? "Datos y piloto para admin"
              : kitchenArea
                ? "Datos y piloto para cocinas"
                : "Privacidad y piloto"}
          </button>
        </div>
      </footer>
      {!kitchenArea && !adminArea && (
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
      {adminSession && (
        <nav className="mobile-nav admin-mobile-nav" aria-label="Navegación de admin">
          <a href={routes.adminPedidos} aria-current={page === "adminPedidos" ? "page" : undefined} onClick={(event) => follow(event, "adminPedidos")}><span className="mobile-icon"><BrandOrdersIcon size={22} /></span><span>Pedidos</span></a>
          <a href={routes.adminComentarios} aria-current={page === "adminComentarios" ? "page" : undefined} onClick={(event) => follow(event, "adminComentarios")}><span className="mobile-icon"><Star size={22} /></span><span>Comentarios</span></a>
        </nav>
      )}
      <InstallPrompt suppressed={Boolean(selected || dataNotice || notice || reviewPrompt || commentsKitchen)} />
      {reviewPrompt && <ReviewPromptDialog review={reviewPrompt} onClose={() => setReviewPrompt(null)} onSaved={async () => {
        setReviewPrompt(null);
        invalidateCache("orders:");
        try {
          await refreshCatalog(true, true);
          if (page === "pedidos") await loadOrders(ordersPage, true);
        } catch { /* La reseña ya quedó guardada. */ }
      }} />}
      {commentsKitchen && <KitchenCommentsDialog kitchen={commentsKitchen} onClose={() => setCommentsKitchen(null)} />}
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
  hideCurrentWeek,
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
  hideCurrentWeek: boolean;
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
          {!hideCurrentWeek && (
            <button
              type="button"
              aria-pressed={week === 0}
              className={week === 0 ? "active" : ""}
              onClick={() => setWeek(0)}
            >
              Esta semana
            </button>
          )}
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
              onMouseDown={(event) => event.preventDefault()}
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
                onMouseDown={(event) => event.preventDefault()}
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
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => choosePickup(null, event)}
            >
              Cualquier horario
            </button>
            {pickupOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                aria-pressed={pickupFilter === option.key}
                onMouseDown={(event) => event.preventDefault()}
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

type ReviewableOrder = {
  orderId: string;
  kitchenName: string;
  code: string;
  items: { id: string; name: string; imageUrl: string; quantity: number; rating?: number | null }[];
};

function KitchenReviewForm({ review, onSaved, inPrompt = false }: {
  review: ReviewableOrder;
  onSaved: () => Promise<void>;
  inPrompt?: boolean;
}) {
  const [foodRatings, setFoodRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/orders/${review.orderId}/review`, {
        foodRatings: review.items.map((item) => ({ orderItemId: item.id, rating: foodRatings[item.id] })),
        comment,
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar tu reseña.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="review-form" onSubmit={submit}>
    {!inPrompt && <><h3>¿Qué tal estuvo la sazón?</h3><p>El promedio se reflejará en la puntuación de {review.kitchenName}.</p></>}
    <div className="review-ordered-items">
      {review.items.map((item) => <div key={item.id}>
        <img src={item.imageUrl} alt="" />
        <RatingInput label={`${item.quantity} × ${item.name}`} value={foodRatings[item.id] || 0}
          onChange={(rating) => setFoodRatings((current) => ({ ...current, [item.id]: rating }))} disabled={saving} />
      </div>)}
    </div>
    <label className="review-comment-field">Tu comentario
      <textarea value={comment} maxLength={100} rows={3} required disabled={saving} onChange={(event) => setComment(event.target.value)} placeholder="Cuéntanos qué te gustó de su sazón" />
      <small>{comment.length}/100 caracteres</small>
    </label>
    <p className="review-public-note">Tu comentario será público. El lenguaje ofensivo podrá sancionarse con el bloqueo de la reseña.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button type="submit" disabled={saving || review.items.some((item) => !foodRatings[item.id]) || !comment.trim()}>{saving ? "Guardando…" : "Enviar reseña"} <ArrowRight size={18} /></Button>
  </form>;
}

function ReviewPromptDialog({ review, onClose, onSaved }: {
  review: ReviewableOrder;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  return createPortal(<dialog ref={ref} className="review-prompt-dialog" aria-labelledby="review-prompt-title" onClose={onClose}>
    <div className="review-prompt-scroll dialog-scroll">
      <button type="button" className="icon-button review-prompt-close" onClick={() => ref.current?.close()} aria-label="Cerrar reseña"><X size={20} /></button>
      <span className="eyebrow">TU PEDIDO FUE ENTREGADO</span>
      <h2 id="review-prompt-title">¿Qué tal estuvo la sazón?</h2>
      <p>El promedio se reflejará en la puntuación de {review.kitchenName}.</p>
      <KitchenReviewForm review={review} onSaved={onSaved} inPrompt />
    </div>
  </dialog>, document.body);
}

type PublicKitchenReview = Pick<ReviewableOrder, "orderId" | "items"> & {
  comment: string;
  createdAt: string;
};

function KitchenCommentsDialog({ kitchen, onClose }: { kitchen: Kitchen; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reviews, setReviews] = useState<PublicKitchenReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
    api<{ reviews: PublicKitchenReview[] }>(`/api/kitchens/${kitchen.id}/reviews`)
      .then((result) => setReviews(result.reviews))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar los comentarios."))
      .finally(() => setLoading(false));
  }, [kitchen.id]);
  return createPortal(<dialog ref={ref} className="kitchen-comments-dialog" aria-labelledby="kitchen-comments-title" onClose={onClose}>
    <button type="button" className="icon-button review-prompt-close" onClick={() => ref.current?.close()} aria-label="Cerrar comentarios"><X size={20} /></button>
    <span className="eyebrow">OPINIONES DE ESTUDIANTES</span>
    <h2 id="kitchen-comments-title">Comentarios de {kitchen.name}</h2>
    {loading ? <p role="status">Cargando comentarios…</p> : error ? <p className="form-error" role="alert">{error}</p> : reviews.length ? <div className="kitchen-comments-list">{reviews.map((review) => <article key={review.orderId} className="kitchen-comment-card">
      <p>{review.comment}</p>
      <div className="kitchen-comment-items">{review.items.map((item) => <div key={item.id}><img src={item.imageUrl} alt="" loading="lazy" /><span>{item.quantity} × {item.name}{item.rating && <strong>★ {item.rating}/5</strong>}</span></div>)}</div>
    </article>)}</div> : <p>Aún no hay comentarios para esta cocina.</p>}
  </dialog>, document.body);
}

function PaymentInstructions({ order, onUploaded }: { order: Order; onUploaded: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!order.paymentCheckoutId || order.paymentStatus !== "awaiting_proof") return null;
  async function upload() {
    if (!file || !order.paymentCheckoutId) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 2_000_000 || !["image/png", "image/jpeg"].includes(file.type))
        throw new Error("El comprobante debe ser PNG o JPG de hasta 2 MB.");
      const csrf = document.cookie.split(";").map((part) => part.trim())
        .find((part) => part.startsWith("menuu_csrf="))?.slice("menuu_csrf=".length);
      const response = await fetch(`/api/payments/${order.paymentCheckoutId}/proof`, {
        method: "POST", headers: { "Content-Type": file.type, ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No pudimos subir el comprobante.");
      await onUploaded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos subir el comprobante.");
    } finally { setBusy(false); }
  }
  return <section className="yape-payment" aria-label="Pago anticipado con Yape">
    <h3>Completa tu pago con Yape</h3>
    <p>Yapea <strong>{money(order.paymentAmountSoles ?? order.totalSoles)}</strong> a Fernando Wilder Altamirano Pinedo y sube el comprobante antes de {order.paymentExpiresAt ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" }).format(new Date(order.paymentExpiresAt)).replace(/([ap])\.\s*m\./gi, "$1.m.") : "que termine el plazo"}.</p>
    <img className="yape-qr" src="/images/yape-fernando.jpeg" alt="QR de Yape de Fernando Wilder Altamirano Pinedo" />
    <a className="yape-download" href="/images/yape-fernando.jpeg" download="menuu-yape-fernando.jpeg">Descargar QR</a>
    <p>Elige una forma de usar el QR en Yape:</p>
    <ol><li><strong>Escanear QR:</strong> apunta tu cámara al código si usas otro dispositivo.</li><li><strong>Subir una imagen con QR:</strong> descarga la foto y súbela en Yape si pagas desde este celular.</li></ol>
    <p>Confirma el destinatario y el monto en Yape. Luego sube aquí una imagen del comprobante del pago realizado.</p>
    <label className="yape-upload">Comprobante de Yape (PNG o JPG, hasta 2 MB)<input type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    <Button onClick={upload} disabled={!file || busy}>{busy ? "Subiendo…" : "Enviar comprobante"}</Button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

function OrderCard({
  order,
  showPayment,
  onReviewed,
}: {
  order: Order;
  showPayment: boolean;
  onReviewed: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const afterDelivery =
    new Date(`${order.date}T${order.deliveryTime}:00-05:00`) <= new Date();
  const canReview =
    order.status === "entregado" &&
    order.reviewEnabled &&
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
            : order.paymentStatus === "awaiting_proof" ? "Falta comprobante"
            : order.paymentStatus === "under_review" ? "Pago en revisión"
            : "Reservado";
  const settled = order.status !== "reservado";
  const canCancel = order.status === "reservado" && !afterDelivery && !order.paymentCheckoutId;
  const firstItem = order.items[0];
  const otherItems = order.items.length - 1;
  const paymentLabel = order.paymentCheckoutId
    ? `Yape · ${order.paymentStatus === "approved" ? "aprobado" : order.paymentStatus === "under_review" ? "en revisión" : order.paymentStatus === "awaiting_proof" ? "falta comprobante" : order.paymentStatus === "expired" ? "plazo vencido" : "rechazado"}`
    : order.payment;
  async function cancelReservation() {
    setCancelBusy(true);
    setError("");
    try {
      await api(`/api/orders/${order.id}/cancel`, {});
      await onReviewed();
      setCancelOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos cancelar tu reserva.",
      );
    } finally {
      setCancelBusy(false);
    }
  }
  return (
    <article className="order-card">
      <div className="order-overview">
        {firstItem && <img className="order-thumbnail" src={firstItem.imageUrl || "/images/menuu-logo.png"} alt="" loading="lazy" />}
        <div className="order-overview-content">
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
          <p className="order-dish-preview">
            {firstItem ? `${firstItem.quantity} × ${firstItem.name}` : "Pedido"}
            {otherItems > 0 && <span> + {otherItems} {otherItems === 1 ? "plato" : "platos"} más</span>}
          </p>
          <div className="order-highlights">
            <span className="order-pickup"><BrandCalendarIcon size={18} aria-hidden="true" /> Recojo: {dateLabel(order.date)} · {pickupWindow(order.deliveryTime, order.pickupUntil)}</span>
            <strong>{money(order.totalSoles)}</strong>
          </div>
        </div>
      </div>
      <div className="order-card-bottom">
        <span>{paymentLabel}</span>
        <details className="order-details">
          <summary>Ver detalle <ChevronDown size={17} aria-hidden="true" /></summary>
          <div className="order-details-content">
            <div className="order-items">
              {order.items.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.quantity} × {item.name}
                    {item.choices.length > 0 && <small>{item.choices.map((choice) => choice.label).join(" · ")}</small>}
                    {item.comment && <small>Comentario: {item.comment}</small>}
                  </span>
                  <strong>{money(item.totalSoles)}</strong>
                </div>
              ))}
            </div>
            {order.paymentStatus === "approved" && order.status === "reservado" && <p className="yape-cancel-note">Si necesitas cancelar este pedido pagado, contacta a Menúu para coordinar la devolución.</p>}
            {order.status === "entrega_pendiente" && <p className="review-note">Tu solicitud está registrada. La entrega aún no ha sido confirmada.</p>}
            {order.status === "no_se_presento" && <p className="review-note">No se registró el recojo dentro de los 15 minutos posteriores a la hora prevista.</p>}
            {order.status === "entregado" && !order.reviewEnabled && order.kitchenRating === null && <p className="review-note">La reseña todavía no está habilitada para este pedido.</p>}
            {order.kitchenRating !== null && <p className="review-note">Calificaste la comida de {order.kitchenName}.{order.kitchenComment && <> “{order.kitchenComment}”</>}</p>}
            {canCancel && (
              <div className="order-cancel">
                {cancelOpen ? (
                  <div className="order-cancel-confirm">
                    <p>¿Cancelar esta reserva? Se liberarán las porciones para otros estudiantes.</p>
                    <div>
                      <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelBusy}>Volver</Button>
                      <Button onClick={cancelReservation} disabled={cancelBusy}>{cancelBusy ? "Cancelando…" : "Sí, cancelar reserva"}</Button>
                    </div>
                  </div>
                ) : <button type="button" className="order-cancel-link" onClick={() => setCancelOpen(true)}>Cancelar reserva</button>}
                {error && <p className="form-error" role="alert">{error}</p>}
              </div>
            )}
          </div>
        </details>
      </div>
      {showPayment && order.paymentStatus === "awaiting_proof" && <details className="order-action-panel">
        <summary>Completar pago con Yape <ChevronDown size={17} aria-hidden="true" /></summary>
        <PaymentInstructions order={order} onUploaded={onReviewed} />
      </details>}
      {showPayment && order.paymentStatus === "under_review" && <p className="order-attention" role="status">Recibimos tu comprobante. Confirmaremos tu reserva al verificar el Yape.</p>}
      {showPayment && order.paymentStatus === "rejected" && <p className="order-attention order-attention-error" role="alert">Comprobante rechazado: {order.paymentReviewNote}. Si ya yapeaste, contacta a Menúu.</p>}
      {showPayment && order.paymentStatus === "expired" && <p className="order-attention order-attention-error" role="status">Terminó el plazo para subir el comprobante y se liberó el cupo. Si ya yapeaste, contacta a Menúu.</p>}
      {canReview && <details className="order-action-panel">
        <summary>Calificar mi comida <ChevronDown size={17} aria-hidden="true" /></summary>
        <KitchenReviewForm review={{ orderId: order.id, kitchenName: order.kitchenName, code: order.code, items: order.items }} onSaved={onReviewed} />
      </details>}
    </article>
  );
}
