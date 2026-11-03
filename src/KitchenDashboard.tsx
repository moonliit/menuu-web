import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "./components/ui";
import { CustomizationDialog } from "./components/CustomizationDialog";
import {
  BrandAddIcon,
  BrandCalendarIcon,
  BrandCameraIcon,
  BrandDeleteIcon,
  BrandDishIcon,
  BrandLogoutIcon,
  BrandOrdersIcon,
  BrandStatsIcon,
} from "./components/BrandIcons";
import {
  dateLabel,
  money,
  timeLabel,
  weekDate,
  type CustomizationGroup,
  type User,
} from "./data/catalog";
import "./kitchen.css";
import "./admin.css";
import { cachedRequest, invalidateCache } from "./data/queryCache";

type Dish = {
  id: string;
  name: string;
  description: string;
  priceSoles: number;
  imageUrl: string;
  imageAlt: string;
  active: boolean;
  customization: CustomizationGroup[];
};
type Offer = {
  id: string;
  dishId: string;
  date: string;
  deliveryTime: string;
  pickupUntil: string;
  bookingDeadline: string;
  capacity: number;
  reservedCount: number;
  descriptionOverride: string | null;
  priceSoles: number | null;
  hasCustomizationOverride: boolean;
  customization: CustomizationGroup[];
  publishedAt: string | null;
  soldOutAt: string | null;
};
type KitchenReservation = {
  offerId: string;
  orderItemId: number;
  orderId: string;
  code: string;
  studentName: string;
  studentEmail: string;
  quantity: number;
  unitPriceCents: number;
  deliveredQuantity: number | null;
  bookingDeadlineAt: string | null;
  status: string;
  fulfillmentStatus: "pending" | "delivered" | "no_show";
  paymentRecorded: string | null;
  paymentCheckoutId: string | null;
  paymentStatus: "awaiting_proof" | "under_review" | "approved" | "rejected" | "expired" | null;
  deliveredAt: string | null;
  createdAt: string;
  manualAdded: boolean;
  extraPortion: boolean;
};
type ReservationState = "pending" | "delivered" | "cancelled";
const limaDeliveryInput = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const deliveredAtLabel = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(/([ap])\.\s*m\./gi, "$1.m.");
const reservationState = (item: KitchenReservation): ReservationState =>
  item.status !== "reservado" || item.fulfillmentStatus === "no_show"
    ? "cancelled"
    : item.fulfillmentStatus === "delivered"
      ? "delivered"
      : "pending";
const deliveredUnitsForOffer = (
  reservations: KitchenReservation[],
  offerId: string,
) =>
  reservations
    .filter(
      (item) =>
        item.offerId === offerId &&
        item.status === "reservado" &&
        item.fulfillmentStatus === "delivered",
    )
    .reduce((sum, item) => sum + (item.deliveredQuantity ?? item.quantity), 0);
const onTimeReservationsForOffer = (
  reservations: KitchenReservation[],
  offer: Offer,
) =>
  new Set(
    reservations
      .filter(
        (item) =>
          item.offerId === offer.id &&
          item.status === "reservado" &&
          item.fulfillmentStatus !== "no_show" &&
          new Date(item.createdAt).getTime() <=
            new Date(item.bookingDeadlineAt || offer.bookingDeadline).getTime(),
      )
      .map((item) => item.orderId),
  ).size;
type StatOffer = {
  id: string;
  dishId: string;
  dishName: string;
  date: string;
  capacity: number;
  reservedCount: number;
  publishedAt: string | null;
  soldOutAt: string | null;
  units: number;
  revenueCents: number;
  orderCount: number;
  firstBookingAt: string | null;
};
type Data = {
  profile: {
    id: string;
    name: string;
    description: string;
    logoUrl: string;
    imageUrl: string;
  };
  dishes: Dish[];
  offers: Offer[];
  reservations: KitchenReservation[];
  analytics: {
    offers: StatOffer[];
    bookingHours: { hour: number; units: number }[];
    bookingTimeline: { offerId: string; hour: string; units: number }[];
    totalOrders: number;
  };
};
type KitchenPayload = Omit<Data, "analytics"> & { analytics: Data["analytics"] | null };
const emptyAnalytics: Data["analytics"] = {
  offers: [], bookingHours: [], bookingTimeline: [], totalOrders: 0,
};
export type KitchenSection =
  "inicio" | "menu" | "platos" | "estadisticas" | "cuenta";
const todayLima = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const localDateTime = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = (kind: string) =>
    parts.find((part) => part.type === kind)?.value || "";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
};
const isoFromLocal = (value: string) =>
  new Date(`${value}:00-05:00`).toISOString();
const blankDish = (): Dish => ({
  id: "",
  name: "",
  description: "",
  priceSoles: 0,
  imageUrl: "",
  imageAlt: "",
  active: true,
  customization: [],
});
const blankOffer = (dishId = ""): Offer => {
  const today = todayLima();
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  let date =
    nowTime >= "12:59"
      ? new Date(Date.parse(`${today}T12:00:00Z`) + 86400000)
          .toISOString()
          .slice(0, 10)
      : today;
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0)
    date = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
  return {
    id: "",
    dishId,
    date,
    deliveryTime: "13:00",
    pickupUntil: "13:10",
    bookingDeadline: `${date}T12:59`,
    capacity: 10,
    reservedCount: 0,
    descriptionOverride: null,
    priceSoles: null,
    hasCustomizationOverride: false,
    customization: [],
    publishedAt: null,
    soldOutAt: null,
  };
};
const cloneGroups = (groups: CustomizationGroup[]) =>
  JSON.parse(JSON.stringify(groups)) as CustomizationGroup[];
const duration = (start: string | null, end: string) => {
  if (!start) return "Sin fecha histórica";
  const minutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
  if (minutes < 0) return "Sin fecha histórica";
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || "No pudimos guardar los cambios.");
  return result;
}
async function upload(file: File, scope: "profile" | "dish") {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Elige una foto PNG o JPG.");
  const response = await fetch(
    `/api/kitchen/photo${scope === "dish" ? "?scope=dish" : ""}`,
    { method: "POST", headers: { "Content-Type": file.type }, body: file },
  );
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url)
    throw new Error(result.error || "No pudimos subir la foto.");
  return result.url;
}

function KitchenSelect({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
  withinDialog = false,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  withinDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (!open || !withinDialog) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const gap = 6;
      const edge = 12;
      const desiredHeight = Math.min(250, options.length * 44 + 14);
      const below = window.innerHeight - bounds.bottom - gap - edge;
      const above = bounds.top - gap - edge;
      const openUp = below < desiredHeight && above > below;
      const maxHeight = Math.max(
        44,
        Math.min(desiredHeight, openUp ? above : below),
      );
      const nextPosition: {
        top?: number;
        bottom?: number;
        left: number;
        width: number;
        maxHeight: number;
      } = {
        ...(openUp
          ? { bottom: window.innerHeight - bounds.top + gap }
          : { top: bounds.bottom + gap }),
        left: Math.max(
          edge,
          Math.min(bounds.left, window.innerWidth - bounds.width - edge),
        ),
        width: Math.min(bounds.width, window.innerWidth - edge * 2),
        maxHeight,
      };
      setPopupPosition((current) =>
        current?.top === nextPosition.top &&
        current?.bottom === nextPosition.bottom &&
        current?.left === nextPosition.left &&
        current?.width === nextPosition.width &&
        current?.maxHeight === nextPosition.maxHeight
          ? current
          : nextPosition,
      );
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, withinDialog, options.length]);
  useEffect(() => {
    if (open && !wasOpen.current)
      optionRefs.current[
        Math.max(
          0,
          options.findIndex((option) => option.value === value),
        )
      ]?.focus();
    wasOpen.current = open;
  });
  const focusOption = (index: number) =>
    optionRefs.current[(index + options.length) % options.length]?.focus();
  const selected = options.find((option) => option.value === value);
  return (
    <div
      className="km-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <span id={`${id}-label`} className="km-select-label">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="km-select-trigger"
        role="combobox"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") setOpen(false);
        }}
      >
        <span id={`${id}-value`} className={selected ? "" : "placeholder"}>
          {selected?.label || placeholder || "Selecciona una opción"}
        </span>
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`km-select-options${withinDialog ? " km-select-options-dialog" : ""}`}
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          style={
            withinDialog
              ? {
                  ...popupPosition,
                  visibility: popupPosition ? "visible" : "hidden",
                }
              : undefined
          }
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
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
                  focusOption(options.length - 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaginatedList<T>({
  items,
  id,
  noun,
  render,
}: {
  items: T[];
  id: string;
  noun: string;
  render: (visible: T[]) => ReactNode;
}) {
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  return (
    <div className="km-paged-list">
      {render(items.slice(start, start + pageSize))}
      <nav className="km-pagination" aria-label={`Páginas de ${noun}`}>
        <div className="km-page-size">
          <KitchenSelect
            id={`${id}-size`}
            label="Por página"
            value={String(pageSize)}
            options={[5, 10, 20].map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            onChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          />
        </div>
        <span className="km-page-summary" aria-live="polite">
          {start + 1}–{Math.min(start + pageSize, items.length)} de{" "}
          {items.length} {noun}
        </span>
        <div className="km-page-buttons">
          <button
            type="button"
            disabled={currentPage === 1}
            aria-label={`Página anterior de ${noun}`}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={19} />
          </button>
          <span>
            Página {currentPage} de {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage === pageCount}
            aria-label={`Página siguiente de ${noun}`}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </nav>
    </div>
  );
}

function KitchenOfferPreview({
  offer,
  dish,
  kind,
  deliveredCount,
}: {
  offer: Offer;
  dish?: Dish;
  kind: "published" | "reserved";
  deliveredCount: number;
}) {
  const available = Math.max(0, offer.capacity - offer.reservedCount);
  return (
    <article className="km-upcoming-card">
      <img
        src={dish?.imageUrl || "/images/menuu-logo.png"}
        alt={dish?.imageAlt || dish?.name || "Plato publicado"}
      />
      <div className="km-upcoming-copy">
        <strong>{dish?.name || "Plato"}</strong>
        <span>
          {dateLabel(offer.date, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {timeLabel(offer.deliveryTime)}
        </span>
        <div
          className="km-occupancy"
          role="img"
          aria-label={`${offer.reservedCount} de ${offer.capacity} porciones de cupo ocupado`}
        >
          <i
            style={{
              width: `${Math.min(100, (offer.reservedCount / offer.capacity) * 100)}%`,
            }}
          />
        </div>
        <small>
          {kind === "published"
            ? `${deliveredCount} entregadas · ${offer.reservedCount} de ${offer.capacity} cupos ocupados · ${available} libres`
            : `${deliveredCount} entregadas · ${offer.reservedCount} cupos ocupados`}
        </small>
      </div>
    </article>
  );
}

function KitchenHome({ data, today }: { data: Data; today: string }) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const upcoming = data.offers
    .filter(
      (offer) =>
        offer.date > today ||
        (offer.date === today && offer.pickupUntil >= time),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.deliveryTime.localeCompare(b.deliveryTime),
    );
  const reserved = upcoming.filter((offer) => offer.reservedCount > 0);
  const reservedCount = upcoming.reduce(
    (sum, offer) => sum + deliveredUnitsForOffer(data.reservations, offer.id),
    0,
  );
  const unreserved = upcoming.reduce(
    (sum, offer) => sum + offer.capacity - offer.reservedCount,
    0,
  );
  const dish = (offer: Offer) =>
    data.dishes.find((item) => item.id === offer.dishId);
  return (
    <div className="km-home">
      <div className="km-metrics km-home-metrics">
        <div>
          <BrandCalendarIcon size={24} />
          <span>Menús próximos</span>
          <strong>{upcoming.length}</strong>
          <small>Hasta el fin de la siguiente semana</small>
        </div>
        <div>
          <BrandOrdersIcon size={24} />
          <span>Porciones entregadas</span>
          <strong>{reservedCount}</strong>
          <small>De los próximos recojos</small>
        </div>
        <div>
          <BrandDishIcon size={24} />
          <span>Porciones sin reserva</span>
          <strong>{unreserved}</strong>
          <small>Capacidad aún no reservada</small>
        </div>
      </div>
      <div className="km-home-grid">
        <section className="km-panel">
          <span className="eyebrow">LO QUE VIENE</span>
          <h2>Menú publicado</h2>
          <p className="km-panel-intro">
            La barra muestra qué parte de cada menú ya está reservada.
          </p>
          {upcoming.length ? (
            <PaginatedList
              items={upcoming}
              id="published"
              noun="menús"
              render={(visible) => (
                <div className="km-upcoming-list">
                  {visible.map((offer) => (
                    <KitchenOfferPreview
                      key={offer.id}
                      offer={offer}
                      dish={dish(offer)}
                      kind="published"
                      deliveredCount={deliveredUnitsForOffer(
                        data.reservations,
                        offer.id,
                      )}
                    />
                  ))}
                </div>
              )}
            />
          ) : (
            <p>Aún no hay menús para próximos recojos.</p>
          )}
          <a className="km-panel-link" href="#cocina/menu">
            Gestionar menús <ArrowRight size={17} />
          </a>
        </section>
        <section className="km-panel">
          <span className="eyebrow">POR PREPARAR</span>
          <h2>Reservas próximas</h2>
          <p className="km-panel-intro">
            Porciones confirmadas para cada recojo.
          </p>
          {reserved.length ? (
            <PaginatedList
              items={reserved}
              id="reserved"
              noun="menús con reservas"
              render={(visible) => (
                <div className="km-upcoming-list">
                  {visible.map((offer) => (
                    <KitchenOfferPreview
                      key={offer.id}
                      offer={offer}
                      dish={dish(offer)}
                      kind="reserved"
                      deliveredCount={deliveredUnitsForOffer(
                        data.reservations,
                        offer.id,
                      )}
                    />
                  ))}
                </div>
              )}
            />
          ) : (
            <p>Aún no hay reservas para los próximos recojos.</p>
          )}
          <a className="km-panel-link" href="#cocina/estadisticas">
            Analizar reservas <ArrowRight size={17} />
          </a>
        </section>
      </div>
    </div>
  );
}

function KitchenDishCard({
  item,
  onEdit,
  onPreview,
}: {
  item: Dish;
  onEdit: () => void;
  onPreview: () => void;
}) {
  return (
    <article className="km-dish-card">
      <img src={item.imageUrl} alt={item.imageAlt || item.name} />
      <div className="km-dish-card-body">
        <div className="km-dish-card-top">
          <span
            className={`km-dish-status${item.active ? "" : " km-dish-status-off"}`}
          >
            {item.active ? "Disponible para menús" : "Archivado"}
          </span>
          <strong>{money(item.priceSoles)}</strong>
        </div>
        <h2>{item.name}</h2>
        <p>{item.description || "Sin descripción"}</p>
        <div className="km-dish-card-foot">
          <span>
            <BrandDishIcon size={18} />{" "}
            {item.customization.length
              ? `${item.customization.length} ${item.customization.length === 1 ? "grupo de opciones" : "grupos de opciones"}`
              : "Sin personalización"}
          </span>
          <div className="km-dish-card-actions">
            <Button variant="quiet" onClick={onPreview}>
              Vista previa
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Editar
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function KitchenDishPreview({
  dish,
  kitchen,
  onClose,
}: {
  dish: Dish;
  kitchen: Data["profile"];
  onClose: () => void;
}) {
  return (
    <CustomizationDialog
      preview
      offer={{ ...dish, kitchenName: kitchen.name }}
      onClose={onClose}
    />
  );
}

function KitchenMenuRow({
  offer,
  dish,
  onTimeCount,
  deliveredCount,
  today,
  onEdit,
  onReservations,
  reservationsOpen,
}: {
  offer: Offer;
  dish?: Dish;
  onTimeCount: number;
  deliveredCount: number;
  today: string;
  onEdit: () => void;
  onReservations: () => void;
  reservationsOpen: boolean;
}) {
  const past = offer.date < today;
  return (
    <article className="km-menu-row">
      <div className="km-menu-date">
        <strong>
          {dateLabel(offer.date, { weekday: "short", day: "numeric" })}
        </strong>
        <small>
          {timeLabel(offer.deliveryTime)}–{timeLabel(offer.pickupUntil)}
        </small>
      </div>
      <img
        className="km-menu-photo"
        src={dish?.imageUrl || "/images/menuu-logo.png"}
        alt={dish?.imageAlt || dish?.name || "Plato"}
      />
      <div className="km-menu-info">
        <h2>{dish?.name || "Plato"}</h2>
        <p>
          Reserva hasta{" "}
          {new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(offer.bookingDeadline))}
        </p>
      </div>
      <div className="km-menu-count">
        <strong>
          {onTimeCount}{" "}
          {onTimeCount === 1 ? "reserva a tiempo" : "reservas a tiempo"}
        </strong>
        <small>
          {deliveredCount} de {offer.capacity} porciones vendidas
        </small>
      </div>
      <div className="km-menu-action">
        {past ? (
          <span className="km-locked">Día pasado</span>
        ) : (
          <Button variant="secondary" onClick={onEdit}>
            Editar
          </Button>
        )}
        <Button
          variant="quiet"
          onClick={onReservations}
          aria-expanded={reservationsOpen}
        >
          Entregas
        </Button>
      </div>
    </article>
  );
}

function KitchenReservationPanel({
  offer,
  reservations,
  onChanged,
  onClose,
  apiPrefix = "/api/kitchen",
}: {
  offer: Pick<
    Offer,
    "id" | "date" | "deliveryTime" | "pickupUntil" | "capacity" | "reservedCount"
  >;
  reservations: KitchenReservation[];
  onChanged: () => Promise<void>;
  onClose: () => void;
  apiPrefix?: "/api/kitchen" | "/api/admin";
}) {
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<
    { id: string; name: string; email: string; alreadyAdded: boolean }[]
  >([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [refreshStudents, setRefreshStudents] = useState(0);
  const [busyOrder, setBusyOrder] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [paymentPrompt, setPaymentPrompt] = useState<{
    orderId: string;
    orderItemId: number;
    name: string;
    extraordinary: boolean;
    editing: boolean;
    maxQuantity: number;
    prepaid: boolean;
  } | null>(null);
  const [promptMethod, setPromptMethod] = useState("");
  const [promptQuantity, setPromptQuantity] = useState("1");
  const [promptDeliveredAt, setPromptDeliveredAt] = useState("");
  const [promptError, setPromptError] = useState("");
  const paymentDialogRef = useRef<HTMLDialogElement>(null);
  const extraDialogRef = useRef<HTMLDialogElement>(null);
  const [extraItem, setExtraItem] = useState<KitchenReservation | null>(null);
  const [extraQuantity, setExtraQuantity] = useState("1");
  const [extraMethod, setExtraMethod] = useState("");
  useEffect(() => { if (extraItem) extraDialogRef.current?.showModal(); }, [extraItem]);
  useEffect(() => {
    if (paymentPrompt) paymentDialogRef.current?.showModal();
  }, [paymentPrompt]);
  useEffect(() => {
    if (search.trim().length < 2) {
      setStudents([]);
      setStudentTotal(0);
      setLoadingStudents(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoadingStudents(true);
      try {
        const result = await request<{ students: typeof students; total: number }>(
          `${apiPrefix}/offers/${offer.id}/students?q=${encodeURIComponent(search.trim())}&limit=20&offset=${studentPage * 20}`,
        );
        if (active) {
          setStudents(result.students);
          setStudentTotal(result.total);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos buscar estudiantes.",
          );
      } finally {
        if (active) setLoadingStudents(false);
      }
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apiPrefix, offer.id, search, studentPage, refreshStudents]);
  async function change(path: string, payload: unknown, key: string) {
    setBusyOrder(key);
    setError("");
    try {
      await request(path, payload);
      await onChanged();
      setRefreshStudents((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar la reserva.",
      );
    } finally {
      setBusyOrder("");
    }
  }
  async function addStudent(student: { id: string; name: string }) {
    setBusyOrder(student.id);
    setError("");
    try {
      const added = await request<{
        orderId: string;
        orderItemId: number;
        extraordinary: boolean;
      }>(`${apiPrefix}/reservations/add`, {
        offerId: offer.id,
        studentId: student.id,
        quantity: 1,
      });
      await onChanged();
      setRefreshStudents((value) => value + 1);
      if (added.extraordinary) {
        setPromptMethod("");
        setPromptQuantity("1");
        setPromptDeliveredAt(limaDeliveryInput(new Date().toISOString()));
        setPromptError("");
        setPaymentPrompt({
          orderId: added.orderId,
          orderItemId: added.orderItemId,
          name: student.name,
          extraordinary: true,
          editing: false,
          maxQuantity: offer.capacity - offer.reservedCount,
          prepaid: false,
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos añadir la reserva.",
      );
    } finally {
      setBusyOrder("");
    }
  }
  function openDeliveryPrompt(item: KitchenReservation) {
    const currentQuantity = item.deliveredQuantity ?? item.quantity;
    setPromptMethod(item.paymentCheckoutId ? "QR" : item.paymentRecorded || "");
    setPromptQuantity(String(currentQuantity));
    setPromptDeliveredAt(
      limaDeliveryInput(item.deliveredAt || new Date().toISOString()),
    );
    setPromptError("");
    setPaymentPrompt({
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      name: item.studentName,
      extraordinary:
        item.manualAdded &&
        new Date(item.createdAt).getTime() >=
          new Date(`${offer.date}T${offer.pickupUntil}:00-05:00`).getTime(),
      editing: item.fulfillmentStatus === "delivered",
      maxQuantity: item.paymentCheckoutId ? item.quantity : Math.max(
        1,
        offer.capacity - offer.reservedCount + currentQuantity,
      ),
      prepaid: Boolean(item.paymentCheckoutId),
    });
  }
  async function savePromptPayment() {
    if (
      !paymentPrompt ||
      !promptMethod ||
      !Number.isInteger(Number(promptQuantity)) ||
      Number(promptQuantity) < 1 ||
      Number(promptQuantity) > paymentPrompt.maxQuantity ||
      (apiPrefix === "/api/admin" && !promptDeliveredAt)
    )
      return;
    setBusyOrder(paymentPrompt.orderId);
    setPromptError("");
    try {
      await request(`${apiPrefix}/reservations/update`, {
        orderId: paymentPrompt.orderId,
        orderItemId: paymentPrompt.orderItemId,
        action: "deliver",
        paymentMethod: promptMethod,
        deliveredQuantity: Number(promptQuantity),
        ...(apiPrefix === "/api/admin"
          ? { deliveredAt: promptDeliveredAt }
          : {}),
      });
      await onChanged();
      paymentDialogRef.current?.close();
    } catch (cause) {
      setPromptError(
        cause instanceof Error
          ? cause.message
          : "No pudimos registrar el pago.",
      );
    } finally {
      setBusyOrder("");
    }
  }
  async function saveExtra() {
    if (!extraItem || !extraMethod || !Number.isInteger(Number(extraQuantity))) return;
    setBusyOrder(extraItem.orderId);
    setError("");
    try {
      await request(`${apiPrefix}/reservations/extra`, {
        orderId: extraItem.orderId,
        orderItemId: extraItem.orderItemId,
        quantity: Number(extraQuantity),
        paymentMethod: extraMethod,
      });
      await onChanged();
      extraDialogRef.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos registrar la porción adicional.");
    } finally { setBusyOrder(""); }
  }
  const pickupEndTime = new Date(
    `${offer.date}T${offer.pickupUntil}:00-05:00`,
  ).getTime();
  const pickupEnded = Date.now() >= pickupEndTime;
  const canAdd = offer.reservedCount < offer.capacity;
  const activeReservations = reservations.filter(
    (item) =>
      item.status === "reservado" && item.fulfillmentStatus !== "no_show",
  );
  const filteredReservations = reservations.filter((item) => {
    const status = reservationState(item);
    return (
      (statusFilter === "all" || statusFilter === status) &&
      (paymentFilter === "all" ||
        (paymentFilter === "unrecorded"
          ? !item.paymentRecorded
          : paymentFilter === item.paymentRecorded))
    );
  });
  return (
    <section className="km-reservations" aria-label="Gestión de entregas">
      <div className="km-reservations-head">
        <div>
          <span className="eyebrow">ENTREGAS DEL MENÚ</span>
          <h2>
            {dateLabel(offer.date, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <p>
            {activeReservations.length} reservas activas · {offer.reservedCount}{" "}
            de {offer.capacity} porciones
            {reservations.length > activeReservations.length &&
              ` · ${reservations.length - activeReservations.length} canceladas`}
          </p>
        </div>
        <button
          className="km-icon-button"
          type="button"
          onClick={onClose}
          aria-label="Cerrar entregas"
        >
          <X size={20} />
        </button>
      </div>
      {error && (
        <p className="km-reservations-error" role="alert">
          {error}
        </p>
      )}
      {reservations.length > 0 && (
        <div className="km-reservation-filters" aria-label="Filtrar reservas">
          <KitchenSelect
            id={`reservation-status-${offer.id}`}
            label="Estado de entrega"
            value={statusFilter}
            options={[
              { value: "all", label: "Todos los estados" },
              { value: "pending", label: "Pendientes" },
              { value: "delivered", label: "Entregadas" },
              { value: "cancelled", label: "Canceladas" },
            ]}
            onChange={setStatusFilter}
          />
          <KitchenSelect
            id={`reservation-payment-${offer.id}`}
            label="Método de pago"
            value={paymentFilter}
            options={[
              { value: "all", label: "Todos los métodos" },
              { value: "unrecorded", label: "Sin registrar" },
              ...["QR", "Efectivo", "Transferencia", "Otro"].map((value) => ({
                value,
                label: value,
              })),
            ]}
            onChange={setPaymentFilter}
          />
          <span aria-live="polite">
            {filteredReservations.length} de {reservations.length} pedidos
          </span>
        </div>
      )}
      {reservations.length ? (
        <div className="km-reservation-list">
          {filteredReservations.length ? (
            filteredReservations.map((item) => {
              const status = reservationState(item);
              const state = item.paymentCheckoutId && item.paymentStatus !== "approved" && status === "pending"
                ? item.paymentStatus === "under_review" ? "Yape en revisión" : "Yape pendiente"
                :
                status === "delivered"
                  ? item.paymentRecorded
                    ? "Entregado"
                    : "Entrega · pago pendiente"
                  : status === "cancelled"
                    ? item.status === "cancelado"
                      ? "Cancelado por estudiante"
                      : "Cancelado · no vino"
                    : "Pendiente";
              return (
                <article
                  className={`km-reservation km-reservation-${status}`}
                  key={item.orderId}
                >
                  <div className="km-reservation-person">
                    <strong>{item.studentName}</strong>
                    <span>{item.studentEmail}</span>
                    <small>
                      {item.quantity}{" "}
                      {item.quantity === 1 ? "porción" : "porciones"} ·{" "}
                      {item.code}
                    </small>
                    <small>
                      {item.extraPortion ? "Porción adicional · pago en el recojo" : item.manualAdded ? "Alta manual" : item.paymentCheckoutId ? "Reserva previa · Yape" : "Reserva anterior"} ·{" "}
                      {new Intl.DateTimeFormat("es-PE", {
                        timeZone: "America/Lima",
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                        .format(new Date(item.createdAt))
                        .replace(/([ap])\.\s*m\./gi, "$1.m.")}
                    </small>
                  </div>
                  <div className="km-reservation-manage">
                    <span className="km-reservation-state">{state}</span>
                    {apiPrefix === "/api/admin" &&
                      item.fulfillmentStatus === "delivered" &&
                      item.status === "reservado" && (
                        <small className="km-delivery-time">
                          Entrega: {item.deliveredAt
                            ? deliveredAtLabel(item.deliveredAt)
                            : "sin fecha registrada"}
                        </small>
                      )}
                    <div className="km-reservation-actions">
                      {item.status === "reservado" && item.paymentStatus === "approved" && !pickupEnded && Date.now() >= new Date(`${offer.date}T${offer.deliveryTime}:00-05:00`).getTime() && canAdd && <Button variant="secondary" disabled={!!busyOrder} onClick={() => { setExtraItem(item); setExtraQuantity("1"); setExtraMethod(""); }}>Vender porción adicional</Button>}
                      {apiPrefix === "/api/admin" &&
                        item.status === "reservado" &&
                        item.fulfillmentStatus === "delivered" && (
                          <Button
                            variant="secondary"
                            disabled={!!busyOrder}
                            onClick={() => openDeliveryPrompt(item)}
                          >
                            Editar entrega
                          </Button>
                        )}
                      {item.status === "reservado" &&
                        (!item.paymentCheckoutId || item.paymentStatus === "approved") &&
                        item.fulfillmentStatus !== "delivered" &&
                        item.fulfillmentStatus !== "no_show" && (
                          <Button
                            variant="secondary"
                            disabled={!!busyOrder}
                            onClick={() => openDeliveryPrompt(item)}
                          >
                            Marcar como entregado
                          </Button>
                        )}
                      {item.status === "reservado" &&
                        item.fulfillmentStatus === "pending" &&
                        pickupEnded &&
                        new Date(item.createdAt).getTime() <= pickupEndTime && (
                          <Button
                            variant="quiet"
                            disabled={!!busyOrder}
                            onClick={() =>
                              change(
                                `${apiPrefix}/reservations/update`,
                                { orderId: item.orderId, action: "cancel" },
                                item.orderId,
                              )
                            }
                          >
                            Marcar como no vino
                          </Button>
                        )}
                      {item.status === "reservado" &&
                        item.fulfillmentStatus !== "pending" && (
                          <Button
                            variant="quiet"
                            disabled={!!busyOrder}
                            onClick={() =>
                              change(
                                `${apiPrefix}/reservations/update`,
                                { orderId: item.orderId, action: "reset" },
                                item.orderId,
                              )
                            }
                          >
                            Corregir estado
                          </Button>
                        )}
                    </div>
                  </div>
                  {item.status === "reservado" &&
                  item.fulfillmentStatus === "delivered" ? (
                    <div className="km-reservation-delivery-fields">
                      <KitchenSelect
                        id={`delivered-${item.orderItemId}`}
                        label="Porciones entregadas"
                        value={String(item.deliveredQuantity ?? item.quantity)}
                        options={Array.from(
                          {
                            length: item.paymentCheckoutId ? item.quantity : Math.max(
                              1,
                              offer.capacity -
                                offer.reservedCount +
                                (item.deliveredQuantity ?? item.quantity),
                            ),
                          },
                          (_, index) => ({
                            value: String(index + 1),
                            label: String(index + 1),
                          }),
                        )}
                        onChange={(value) =>
                          item.paymentRecorded
                            ? change(
                                `${apiPrefix}/reservations/update`,
                                {
                                  orderId: item.orderId,
                                  orderItemId: item.orderItemId,
                                  action: "deliver",
                                  deliveredQuantity: Number(value),
                                  paymentMethod: item.paymentRecorded,
                                },
                                item.orderId,
                              )
                            : openDeliveryPrompt(item)
                        }
                      />
                      {!item.paymentCheckoutId && <KitchenSelect
                        id={`payment-${item.orderItemId}`}
                        label={item.extraPortion ? "Pago de porción adicional" : "Pago efectuado"}
                        value={item.paymentRecorded || ""}
                        placeholder="Sin registrar"
                        options={[
                          "QR",
                          "Efectivo",
                          "Transferencia",
                          "Otro",
                        ].map((value) => ({ value, label: value }))}
                        onChange={(paymentMethod) =>
                          change(
                            `${apiPrefix}/reservations/update`,
                            {
                              orderId: item.orderId,
                              action: "payment",
                              paymentMethod,
                            },
                            item.orderId,
                          )
                        }
                      />}
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="km-empty">No hay reservas con estos filtros.</p>
          )}
        </div>
      ) : (
        <p className="km-empty">Aún no hay reservas en este menú.</p>
      )}
      <div className="km-reservation-add">
        <div>
          <h3>Añadir estudiante</h3>
          <p>
            Busca estudiantes para añadir una reserva o una porción adicional.
            Cada venta adicional se registra con su propio medio de pago y descuenta del cupo.
          </p>
        </div>
        {canAdd ? (
          <>
            <div className="km-student-search">
              <label>
                Buscar por nombre o correo
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setStudentPage(0);
                  }}
                  placeholder="Nombre o correo UTEC"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={loadingStudents || search.trim().length < 2}
                onClick={() => setRefreshStudents((value) => value + 1)}
              >
                {loadingStudents ? "Actualizando…" : "Actualizar estudiantes"}
              </Button>
            </div>
            <div className="km-candidate-list" aria-live="polite">
              {search.trim().length < 2 ? (
                <p>Escribe al menos dos caracteres para buscar estudiantes.</p>
              ) : loadingStudents ? (
                <p>Buscando estudiantes…</p>
              ) : students.length ? (
                students.map((student) => (
                  <div key={student.id}>
                    <span>
                      <strong>{student.name}</strong>
                      <small>{student.email}</small>
                      {student.alreadyAdded && <small className="km-already-added">este estudiante ya se encuentra añadido</small>}
                    </span>
                    {student.alreadyAdded ? <Button
                      variant="secondary"
                      disabled={!!busyOrder || !reservations.some((item) => item.studentEmail === student.email && item.status === "reservado" && item.paymentStatus === "approved") || Date.now() < new Date(`${offer.date}T${offer.deliveryTime}:00-05:00`).getTime() || pickupEnded}
                      onClick={() => {
                        const source = reservations.find((item) => item.studentEmail === student.email && item.status === "reservado" && item.paymentStatus === "approved");
                        if (source) { setExtraItem(source); setExtraQuantity("1"); setExtraMethod(""); }
                      }}
                    >
                      Añadir otra porción
                    </Button> : <Button variant="secondary" disabled={!!busyOrder} onClick={() => addStudent(student)}>Añadir</Button>}
                  </div>
                ))
              ) : (
                <p>No hay estudiantes disponibles con esa búsqueda.</p>
              )}
            </div>
            {studentTotal > 20 && (
              <nav className="km-candidate-pages" aria-label="Páginas de estudiantes">
                <Button type="button" variant="secondary"
                  disabled={studentPage === 0 || loadingStudents}
                  onClick={() => setStudentPage((page) => page - 1)}>Anterior</Button>
                <span>{studentPage + 1} de {Math.ceil(studentTotal / 20)}</span>
                <Button type="button" variant="secondary"
                  disabled={(studentPage + 1) * 20 >= studentTotal || loadingStudents}
                  onClick={() => setStudentPage((page) => page + 1)}>Siguiente</Button>
              </nav>
            )}
          </>
        ) : (
          <p className="km-hint">
            No se pueden añadir más reservas: el cupo se agotó.
          </p>
        )}
      </div>
      <dialog ref={extraDialogRef} className="km-payment-dialog" aria-labelledby="km-extra-title" onClose={() => setExtraItem(null)}>
        <span className="eyebrow">VENTA EN EL RECOJO</span>
        <h2 id="km-extra-title">Porción adicional</h2>
        <p>Esta venta se registrará aparte de la reserva pagada por Yape. Conserva el pago anticipado original.</p>
        <p><strong>Total adicional: {money((extraItem?.unitPriceCents || 0) * Number(extraQuantity || 0) / 100)}</strong></p>
        <KitchenSelect id="km-extra-quantity" withinDialog label="Porciones adicionales" value={extraQuantity}
          options={Array.from({ length: Math.min(10, offer.capacity - offer.reservedCount) }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
          onChange={setExtraQuantity} />
        <KitchenSelect id="km-extra-method" withinDialog label="Medio de pago de esta venta" value={extraMethod} placeholder="Selecciona un método"
          options={["QR", "Efectivo", "Transferencia", "Otro"].map((value) => ({ value, label: value }))} onChange={setExtraMethod} />
        <div className="km-payment-actions"><Button variant="secondary" onClick={() => extraDialogRef.current?.close()}>Volver</Button><Button disabled={!!busyOrder || !extraMethod || !extraQuantity} onClick={saveExtra}>{busyOrder ? "Guardando…" : "Registrar venta"}</Button></div>
      </dialog>
      <dialog
        ref={paymentDialogRef}
        className="km-payment-dialog"
        aria-labelledby="km-payment-title"
        onClose={() => setPaymentPrompt(null)}
      >
        <span className="eyebrow">
          {paymentPrompt?.extraordinary
            ? "RESERVA EXTRAORDINARIA"
            : "ENTREGA DEL PEDIDO"}
        </span>
        <h2 id="km-payment-title">
          {paymentPrompt?.editing ? "Editar entrega" : "Confirma la entrega"}
        </h2>
        <p>
          {paymentPrompt?.editing ? "Corrige" : "Registra"} las porciones
          entregadas a {paymentPrompt?.name} y cómo pagó.
        </p>
        {apiPrefix === "/api/admin" && (
          <label className="km-delivery-time-field" htmlFor="km-delivered-at">
            Fecha y hora de entrega
            <input
              id="km-delivered-at"
              type="datetime-local"
              step="60"
              min={
                paymentPrompt?.extraordinary
                  ? `${offer.date}T${offer.pickupUntil}`
                  : undefined
              }
              max={limaDeliveryInput(new Date().toISOString())}
              value={promptDeliveredAt}
              onChange={(event) => setPromptDeliveredAt(event.target.value)}
            />
            <small>
              {paymentPrompt?.extraordinary
                ? "Hora de Lima. En altas extemporáneas, la reserva toma esta misma hora y no puede ser anterior al fin de recojo."
                : "Hora de Lima. Puedes corregirla después de entregar."}
            </small>
          </label>
        )}
        <div className="km-delivered-quantity">
          <KitchenSelect
            id="km-delivered-quantity"
            withinDialog
            label="Porciones entregadas"
            value={promptQuantity}
            options={Array.from(
              { length: paymentPrompt?.maxQuantity ?? 1 },
              (_, index) => ({
                value: String(index + 1),
                label: String(index + 1),
              }),
            )}
            onChange={setPromptQuantity}
          />
          <small>
            Máximo {paymentPrompt?.maxQuantity ?? 1} según el cupo del menú.
          </small>
        </div>
        {paymentPrompt?.prepaid ? <p className="km-prepaid-note"><strong>Pago previo aprobado:</strong> Yape con QR. Esta entrega no cobra de nuevo. Registra cualquier porción adicional como venta aparte.</p> : <KitchenSelect
          id="km-extra-payment"
          withinDialog
          label="Método de pago de esta venta"
          value={promptMethod}
          placeholder="Selecciona un método"
          options={["QR", "Efectivo", "Transferencia", "Otro"].map((value) => ({
            value,
            label: value,
          }))}
          onChange={setPromptMethod}
        />}
        {promptError && (
          <p className="km-reservations-error" role="alert">
            {promptError}
          </p>
        )}
        <div className="km-payment-actions">
          <Button
            variant="secondary"
            onClick={() => paymentDialogRef.current?.close()}
          >
            {paymentPrompt?.extraordinary ? "Registrar más tarde" : "Volver"}
          </Button>
          <Button
            onClick={savePromptPayment}
            disabled={
              !promptMethod ||
              !!busyOrder ||
              !promptQuantity ||
              !Number.isInteger(Number(promptQuantity)) ||
              Number(promptQuantity) < 1 ||
              Number(promptQuantity) > (paymentPrompt?.maxQuantity ?? 1) ||
              (apiPrefix === "/api/admin" &&
                (!promptDeliveredAt ||
                  (paymentPrompt?.extraordinary &&
                    promptDeliveredAt <
                      `${offer.date}T${offer.pickupUntil}`)))
            }
          >
            {busyOrder ? "Guardando…" : "Guardar entrega"}
          </Button>
        </div>
      </dialog>
    </section>
  );
}

function DishRankingChart({ offers }: { offers: StatOffer[] }) {
  const totals = new Map<string, { name: string; units: number }>();
  for (const offer of offers) {
    const entry = totals.get(offer.dishId) || {
      name: offer.dishName,
      units: 0,
    };
    entry.units += offer.units;
    totals.set(offer.dishId, entry);
  }
  const ranked = [...totals.values()]
    .filter((item) => item.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);
  const max = ranked[0]?.units || 1;
  return (
    <article className="km-panel">
      <span className="eyebrow">PLATOS POPULARES</span>
      <h2>Más reservados</h2>
      <p className="km-panel-intro">
        Porciones reservadas por plato durante los últimos 28 días.
      </p>
      {ranked.length ? (
        <div className="km-ranking">
          {ranked.map((item, index) => (
            <div key={item.name}>
              <div>
                <strong>
                  {index + 1}. {item.name}
                </strong>
                <span>
                  {item.units} {item.units === 1 ? "porción" : "porciones"}
                </span>
              </div>
              <div className="km-ranking-track">
                <i style={{ width: `${(item.units / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>Los platos aparecerán aquí tras la primera reserva.</p>
      )}
    </article>
  );
}

function OptionEditor({
  groups,
  onChange,
  quickCutlery = false,
}: {
  groups: CustomizationGroup[];
  onChange: (groups: CustomizationGroup[]) => void;
  quickCutlery?: boolean;
}) {
  const update = (index: number, patch: Partial<CustomizationGroup>) =>
    onChange(
      groups.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );
  const hasCutlery = groups.some(
    (group) =>
      group.title.trim().toLocaleLowerCase("es") === "¿deseas cubiertos?",
  );
  return (
    <fieldset className="km-options">
      <legend>Personalización</legend>
      <p>Estas opciones aparecerán al confirmar el plato.</p>
      {quickCutlery && (
        <div className="km-cutlery-shortcut">
          <span>
            <strong>Atajo: cubiertos</strong>
            <small>Añade una elección Sí/No sin costo extra.</small>
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={hasCutlery || groups.length >= 8}
            onClick={() =>
              onChange([
                ...groups,
                {
                  id: crypto.randomUUID(),
                  title: "¿Deseas cubiertos?",
                  selectionType: "single",
                  required: true,
                  maxSelections: 1,
                  choices: [
                    {
                      id: crypto.randomUUID(),
                      label: "Sí, con cubiertos",
                      priceSoles: 0,
                    },
                    {
                      id: crypto.randomUUID(),
                      label: "No, sin cubiertos",
                      priceSoles: 0,
                    },
                  ],
                },
              ])
            }
          >
            {hasCutlery ? "Añadido" : "Añadir cubiertos"}
          </Button>
        </div>
      )}
      {groups.map((group, index) => (
        <div className="km-option-group" key={group.id}>
          <div className="km-option-top">
            <strong>Grupo {index + 1}</strong>
            <button
              type="button"
              className="km-text-button"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
              aria-label={`Quitar grupo ${index + 1}`}
            >
              <BrandDeleteIcon size={17} /> Quitar
            </button>
          </div>
          <label>
            <span className="km-field-label">
              Nombre del grupo{" "}
              <span className="km-required" aria-label="obligatorio">
                *
              </span>
            </span>
            <input
              value={group.title}
              maxLength={60}
              required
              onChange={(event) => update(index, { title: event.target.value })}
              placeholder="Por ejemplo, acompañamiento"
            />
          </label>
          <div className="km-option-settings">
            <KitchenSelect
              id={`group-${group.id}-type`}
              label="Tipo de elección"
              value={group.selectionType || "single"}
              options={[
                { value: "single", label: "Una opción" },
                { value: "multiple", label: "Varias opciones" },
              ]}
              onChange={(value) =>
                update(index, {
                  selectionType: value as "single" | "multiple",
                  maxSelections: value === "single" ? 1 : null,
                })
              }
            />
            <label>
              Límite de elecciones
              <input
                type="number"
                min={1}
                max={16}
                disabled={group.selectionType !== "multiple"}
                value={
                  group.selectionType !== "multiple"
                    ? 1
                    : (group.maxSelections ?? "")
                }
                placeholder="Sin límite"
                onChange={(event) =>
                  update(index, {
                    maxSelections: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className="km-check">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(event) =>
                  update(index, { required: event.target.checked })
                }
              />{" "}
              Obligatorio
            </label>
          </div>
          <div className="km-choice-list">
            {group.choices.map((choice, choiceIndex) => (
              <div className="km-choice" key={choice.id}>
                <label>
                  <span className="km-field-label">
                    Opción{" "}
                    <span className="km-required" aria-label="obligatorio">
                      *
                    </span>
                  </span>
                  <input
                    value={choice.label}
                    maxLength={60}
                    required
                    onChange={(event) =>
                      update(index, {
                        choices: group.choices.map((item, i) =>
                          i === choiceIndex
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder="Ej. Con ensalada"
                  />
                </label>
                <label>
                  Extra S/
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={choice.priceSoles || ""}
                    onChange={(event) =>
                      update(index, {
                        choices: group.choices.map((item, i) =>
                          i === choiceIndex
                            ? {
                                ...item,
                                priceSoles: Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                    placeholder="0.00"
                  />
                </label>
                <button
                  type="button"
                  className="km-icon-button"
                  disabled={group.choices.length <= 2}
                  aria-label="Quitar opción"
                  onClick={() =>
                    update(index, {
                      choices: group.choices.filter(
                        (_, i) => i !== choiceIndex,
                      ),
                    })
                  }
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="km-text-button"
            disabled={group.choices.length >= 16}
            onClick={() =>
              update(index, {
                choices: [
                  ...group.choices,
                  { id: crypto.randomUUID(), label: "", priceSoles: 0 },
                ],
              })
            }
          >
            <BrandAddIcon size={17} /> Añadir opción
          </button>
        </div>
      ))}
      <button
        type="button"
        className="km-outline-button"
        disabled={groups.length >= 8}
        onClick={() =>
          onChange([
            ...groups,
            {
              id: crypto.randomUUID(),
              title: "",
              selectionType: "single",
              required: false,
              maxSelections: 1,
              choices: [
                { id: crypto.randomUUID(), label: "", priceSoles: 0 },
                { id: crypto.randomUUID(), label: "", priceSoles: 0 },
              ],
            },
          ])
        }
      >
        <BrandAddIcon size={18} /> Añadir grupo
      </button>
    </fieldset>
  );
}

function KitchenProfile({
  user,
  profile,
  onSaved,
  onLogout,
}: {
  user: User;
  profile: Data["profile"];
  onSaved: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setName(profile.name);
    setDescription(profile.description);
  }, [profile.name, profile.description]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await request("/api/kitchen/profile", { name, description });
      await onSaved();
      setEditing(false);
      setSuccess("Datos de la cocina actualizados.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar los cambios.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changePhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    setSuccess("");
    try {
      await upload(file, "profile");
      await onSaved();
      setSuccess("Foto actualizada.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos subir la foto.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  return (
    <div className="account-panel km-profile">
      <div className="account-intro">
        <div>
          <span className="eyebrow">CORREO DE ACCESO</span>
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
      {error && (
        <p className="form-error km-profile-error" role="alert">
          {error}
        </p>
      )}
      <div className="km-profile-layout">
        <div className="km-profile-photo">
          <img
            src={profile.logoUrl || "/images/menuu-logo.png"}
            alt={`Foto de ${profile.name}`}
          />
          <button
            type="button"
            className="km-outline-button"
            disabled={photoBusy}
            onClick={() => photoInputRef.current?.click()}
          >
            <BrandCameraIcon size={18} />
            {photoBusy ? "Subiendo…" : "Cambiar foto"}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            disabled={photoBusy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void changePhoto(file);
            }}
          />
          <small>PNG o JPG · máximo 2 MB</small>
        </div>
        {editing ? (
          <form className="account-form km-profile-form" onSubmit={save}>
            <label>
              <span className="km-field-label">
                Nombre de la cocina{" "}
                <small className="km-profile-limit">{name.length}/40</small>
              </span>
              <input
                value={name}
                required
                minLength={2}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Descripción
              <textarea
                value={description}
                maxLength={70}
                rows={2}
                onChange={(event) => setDescription(event.target.value)}
              />
              <small className="km-description-count">
                {description.length}/70 caracteres
              </small>
            </label>
            <div className="account-form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setName(profile.name);
                  setDescription(profile.description);
                  setEditing(false);
                  setError("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (name.trim() === profile.name &&
                    description.trim() === profile.description)
                }
              >
                {busy ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="account-details km-profile-details">
            <div className="account-detail">
              <dt>Nombre de la cocina</dt>
              <dd>{profile.name}</dd>
            </div>
            <div className="account-detail">
              <dt>Descripción</dt>
              <dd>{profile.description || "Sin descripción"}</dd>
            </div>
            <div className="account-form-actions">
              <Button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setSuccess("");
                }}
              >
                Editar
              </Button>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

function KitchenStats({ data }: { data: Data }) {
  const recent = data.analytics.offers;
  const sold = recent.reduce((sum, item) => sum + item.units, 0);
  const revenue =
    recent.reduce((sum, item) => sum + item.revenueCents, 0) / 100;
  const fastest = [...recent]
    .filter((item) => item.soldOutAt && item.publishedAt)
    .sort(
      (a, b) =>
        new Date(a.soldOutAt!).getTime() -
        new Date(a.publishedAt!).getTime() -
        (new Date(b.soldOutAt!).getTime() - new Date(b.publishedAt!).getTime()),
    )
    .slice(0, 3);
  const hourMax = Math.max(
    1,
    ...data.analytics.bookingHours.map((item) => item.units),
  );
  const timelineOffers = recent.filter((item) =>
    data.analytics.bookingTimeline.some((row) => row.offerId === item.id),
  );
  return (
    <div className="km-analytics">
      <div className="km-metrics km-home-metrics">
        <div>
          <BrandDishIcon size={24} />
          <span>Porciones reservadas</span>
          <strong>{sold}</strong>
          <small>Últimos 28 días</small>
        </div>
        <div>
          <BrandOrdersIcon size={24} />
          <span>Pedidos</span>
          <strong>{data.analytics.totalOrders}</strong>
          <small>Últimos 28 días</small>
        </div>
        <div>
          <BrandStatsIcon size={24} />
          <span>Valor reservado</span>
          <strong>{money(revenue)}</strong>
          <small>Últimos 28 días · reservas con pago aprobado y ventas registradas</small>
        </div>
      </div>
      <div className="km-home-grid">
        <article className="km-panel">
          <span className="eyebrow">CUÁNDO RESERVAN</span>
          <h2>Horas de reserva</h2>
          <p className="km-panel-intro">
            Porciones reservadas según la hora en Lima durante los últimos 28
            días.
          </p>
          {data.analytics.bookingHours.length ? (
            <div className="km-bars">
              {data.analytics.bookingHours.map((item) => (
                <div key={item.hour}>
                  <span>{String(item.hour).padStart(2, "0")}:00</span>
                  <div>
                    <i style={{ width: `${(100 * item.units) / hourMax}%` }} />
                  </div>
                  <strong>{item.units}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p>Aún no hay reservas para mostrar horarios.</p>
          )}
        </article>
        <DishRankingChart offers={recent} />
      </div>
      <article className="km-panel km-fastest">
        <span className="eyebrow">SE AGOTARON ANTES</span>
        <h2>Los más rápidos</h2>
        <p className="km-panel-intro">
          Tiempo desde la publicación hasta agotar las porciones.
        </p>
        {fastest.length ? (
          fastest.map((item) => (
            <div className="km-mini-row" key={item.id}>
              <span>
                {item.dishName}
                <small>{dateLabel(item.date)}</small>
              </span>
              <strong>{duration(item.publishedAt, item.soldOutAt!)}</strong>
            </div>
          ))
        ) : (
          <p>Cuando una oferta agote sus porciones, aparecerá aquí.</p>
        )}
      </article>
      <article className="km-panel">
        <span className="eyebrow">POR OFERTA</span>
        <h2>Ritmo de cada menú</h2>
        <p className="km-panel-intro">
          Tiempo desde la publicación hasta la primera reserva y el agotamiento.
        </p>
        {recent.length ? (
          <PaginatedList
            items={recent}
            id="stats-offers"
            noun="menús"
            render={(visible) => (
              <div className="km-stat-table">
                <div className="km-stat-head">
                  <span>Plato y día</span>
                  <span>Publicación → primera reserva</span>
                  <span>Agotó stock</span>
                  <span>Reservas</span>
                </div>
                {visible.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{item.dishName}</strong>
                      <small>
                        {dateLabel(item.date, {
                          day: "numeric",
                          month: "short",
                        })}
                      </small>
                    </span>
                    <span>
                      {item.firstBookingAt
                        ? duration(item.publishedAt, item.firstBookingAt)
                        : "Sin reservas"}
                    </span>
                    <span>
                      {item.soldOutAt
                        ? duration(item.publishedAt, item.soldOutAt)
                        : item.reservedCount >= item.capacity
                          ? "Sin marca histórica"
                          : "No se agotó"}
                    </span>
                    <span>
                      {item.units}/{item.capacity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          />
        ) : (
          <p>Aún no hay ofertas para analizar.</p>
        )}
      </article>
      <article className="km-panel">
        <span className="eyebrow">DETALLE DE RESERVAS</span>
        <h2>Reservas por hora y menú</h2>
        <p className="km-panel-intro">
          Abre un menú para ver a qué hora llegaron sus reservas.
        </p>
        {timelineOffers.length ? (
          <PaginatedList
            items={timelineOffers}
            id="stats-timeline"
            noun="menús con reservas"
            render={(visible) => (
              <div className="km-timeline">
                {visible.map((item) => (
                  <details key={item.id}>
                    <summary>
                      <strong>{item.dishName}</strong>
                      <span>
                        Publicado:{" "}
                        {item.publishedAt
                          ? localDateTime(item.publishedAt).replace("T", " · ")
                          : "Sin fecha histórica"}
                      </span>
                    </summary>
                    <div>
                      {data.analytics.bookingTimeline
                        .filter((row) => row.offerId === item.id)
                        .map((row) => (
                          <span key={row.hour}>
                            {row.hour} · {row.units}{" "}
                            {row.units === 1 ? "porción" : "porciones"}
                          </span>
                        ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          />
        ) : (
          <p>Aún no hay reservas por hora para mostrar.</p>
        )}
        <small className="km-footnote">
          Se cuentan reservas confirmadas. El tiempo hasta agotar stock se
          registra desde ahora para cada oferta nueva.
        </small>
      </article>
    </div>
  );
}

export default function KitchenDashboard({
  section,
  user,
  onLogout,
}: {
  section: KitchenSection;
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dish, setDish] = useState<Dish | null>(null);
  const [dishStep, setDishStep] = useState<1 | 2>(1);
  const [previewDish, setPreviewDish] = useState<Dish | null>(null);
  const [createdDish, setCreatedDish] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [reservationsOfferId, setReservationsOfferId] = useState<string | null>(
    null,
  );
  const [week, setWeek] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const dishPhotoInputRef = useRef<HTMLInputElement>(null);
  const refresh = async (force = true) => {
    setError("");
    if (force) invalidateCache(`kitchen:data:${user.kitchenId}:`);
    const scope = section === "estadisticas" ? "full" : "operations";
    const next = await cachedRequest(
      `kitchen:data:${user.kitchenId}:${scope}`,
      () => request<KitchenPayload>(
        `/api/kitchen/data${scope === "operations" ? "?scope=operations" : ""}`),
      45_000, force,
    );
    setData((current) => ({
      ...next, analytics: next.analytics ?? current?.analytics ?? emptyAnalytics,
    }));
  };
  useEffect(() => {
    refresh(true).catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "No pudimos cargar tu cocina.",
      ),
    );
  }, [user.kitchenId, section]);
  useEffect(() => {
    if (section !== "inicio" && section !== "menu") return;
    const update = () => {
      if (!document.hidden)
        cachedRequest(`kitchen:data:${user.kitchenId}:operations`,
          () => request<KitchenPayload>("/api/kitchen/data?scope=operations"), 45_000, true)
          .then((next) => setData((current) => ({
            ...next, analytics: current?.analytics ?? emptyAnalytics,
          })))
          .catch(() => {});
    };
    const timer = window.setInterval(update, 45_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [user.kitchenId, section]);
  const save = async (path: string, payload: unknown, done: () => void) => {
    setBusy(true);
    setError("");
    try {
      await request(path, payload);
      await refresh();
      done();
      setNotice("Cambios guardados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar.");
    } finally {
      setBusy(false);
    }
  };
  const changeDishImage = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      const url = await upload(file, "dish");
      setDish(
        (current) =>
          current && {
            ...current,
            imageUrl: url,
            imageAlt: current.imageAlt || current.name,
          },
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos subir la foto.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };
  const current = todayLima();
  const day = new Date(`${current}T12:00:00Z`);
  const monday = new Date(day);
  monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const next = new Date(monday);
  next.setUTCDate(monday.getUTCDate() + 7);
  const weeks = [
    monday.toISOString().slice(0, 10),
    next.toISOString().slice(0, 10),
  ];
  const visibleOffers =
    data?.offers.filter(
      (item) =>
        item.date >= weeks[week] && item.date < weekDate(weeks[week], 7),
    ) || [];
  const showError = error && (
    <div className="km-alert" role="alert">
      {error}
      <button
        type="button"
        onClick={() => setError("")}
        aria-label="Cerrar error"
      >
        <X size={18} />
      </button>
    </div>
  );
  return (
    <section className="km-shell">
      <div className="km-heading">
        <span className="eyebrow">ESPACIO DE COCINAS</span>
        <h1>
          {section === "inicio"
            ? `Hola, ${data?.profile.name || "cocina"}`
            : {
                menu: "Menús semanales",
                platos: "Mis platos",
                estadisticas: "Estadísticas",
                cuenta: "Mi cocina",
              }[section]}
        </h1>
        <p>
          {section === "inicio"
            ? "Organiza los próximos recojos y las porciones por preparar."
            : section === "menu"
              ? "Publica platos creados para esta semana y la siguiente."
              : section === "platos"
                ? "Prepara tu catálogo antes de añadirlo a un menú."
                : section === "estadisticas"
                  ? "Analiza las reservas de los últimos 28 días y descubre cuándo se llenan tus menús."
                  : "Actualiza los datos visibles de tu cocina."}
        </p>
      </div>
      {showError}
      {notice && (
        <div className="km-success" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Cerrar mensaje"
          >
            <X size={17} />
          </button>
        </div>
      )}
      {previewDish && data && (
        <KitchenDishPreview
          dish={previewDish}
          kitchen={data.profile}
          onClose={() => setPreviewDish(null)}
        />
      )}
      {!data ? (
        error ? (
          <div className="km-load-fallback">
            <p>No pudimos mostrar los datos de tu cocina.</p>
            <div>
              <Button
                type="button"
                onClick={() =>
                  refresh().catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "No pudimos cargar tu cocina.",
                    ),
                  )
                }
              >
                Reintentar
              </Button>
              <Button type="button" variant="secondary" onClick={onLogout}>
                <BrandLogoutIcon size={18} /> Cerrar sesión
              </Button>
            </div>
          </div>
        ) : (
          <p className="km-loading" role="status">
            Cargando tu cocina…
          </p>
        )
      ) : (
        <>
          {section === "inicio" && <KitchenHome data={data} today={current} />}
          {section === "cuenta" && (
            <KitchenProfile
              user={user}
              profile={data.profile}
              onSaved={refresh}
              onLogout={onLogout}
            />
          )}
          {section === "platos" && (
            <div className="km-workspace">
              <div className="km-list-head">
                <p>{data.dishes.length} platos creados</p>
                <Button
                  onClick={() => {
                    setDish(blankDish());
                    setDishStep(1);
                    setOffer(null);
                    setCreatedDish(false);
                  }}
                >
                  <BrandAddIcon size={18} inverse /> Nuevo plato
                </Button>
              </div>
              <div
                className={`km-dish-guide${dish && !dish.id ? " km-dish-guide-creating" : ""}${createdDish ? " km-dish-guide-published" : ""}`}
                aria-label="Pasos para publicar un plato"
              >
                <div
                  className={dish && dishStep === 1 ? "km-guide-current" : ""}
                >
                  <BrandDishIcon size={24} />
                  <span>
                    <strong>1. Crea el plato</strong>
                    <small>Foto, descripción y precio base</small>
                  </span>
                </div>
                <div
                  className={dish && dishStep === 2 ? "km-guide-current" : ""}
                >
                  <BrandAddIcon size={24} />
                  <span>
                    <strong>2. Define opciones</strong>
                    <small>Si permites personalizarlo</small>
                  </span>
                </div>
                <div className={createdDish ? "km-guide-current" : ""}>
                  <BrandCalendarIcon size={24} />
                  <span>
                    <strong>3. Publícalo</strong>
                    <small>
                      {createdDish ? (
                        <a href="#cocina/menu">Ir a Menús →</a>
                      ) : (
                        "Elige el día en Menús"
                      )}
                    </small>
                  </span>
                </div>
              </div>
              {dish && (
                <form
                  className="km-editor"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    if (dishStep === 1) {
                      if (dish.imageUrl) setDishStep(2);
                      return;
                    }
                    const wasNew = !dish.id;
                    save("/api/kitchen/dishes", dish, () => {
                      setDish(null);
                      if (wasNew) setCreatedDish(true);
                    });
                  }}
                >
                  <div className="km-editor-head">
                    <div>
                      <span className="eyebrow">PASO {dishStep} DE 2</span>
                      <h2>
                        {dishStep === 1
                          ? dish.id
                            ? "Editar plato"
                            : "Nuevo plato"
                          : "Define las opciones"}
                      </h2>
                    </div>
                    <div className="km-editor-head-actions">
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() =>
                          setPreviewDish({
                            ...dish,
                            customization: cloneGroups(dish.customization),
                          })
                        }
                      >
                        Vista previa
                      </Button>
                      <button
                        type="button"
                        className="km-icon-button"
                        onClick={() => setDish(null)}
                        aria-label="Cerrar editor"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                  {dishStep === 1 ? (
                    <div className="km-form-grid">
                      <label>
                        <span className="km-field-label">
                          Nombre{" "}
                          <span
                            className="km-required"
                            aria-label="obligatorio"
                          >
                            *
                          </span>
                        </span>
                        <input
                          required
                          maxLength={80}
                          value={dish.name}
                          onChange={(event) =>
                            setDish({ ...dish, name: event.target.value })
                          }
                          placeholder="Ej. Ají de gallina"
                        />
                      </label>
                      <label>
                        <span className="km-field-label">
                          Precio base S/{" "}
                          <span
                            className="km-required"
                            aria-label="obligatorio"
                          >
                            *
                          </span>
                        </span>
                        <input
                          type="number"
                          required
                          min={0}
                          max={1000}
                          step="0.01"
                          value={
                            dish.priceSoles === 0 && !dish.id
                              ? ""
                              : dish.priceSoles
                          }
                          onChange={(event) =>
                            setDish({
                              ...dish,
                              priceSoles: Number(event.target.value),
                            })
                          }
                          placeholder="Ej. 11.00"
                        />
                      </label>
                      <label className="km-wide">
                        <span className="km-field-label">
                          Descripción{" "}
                          <small>Opcional · {dish.description.length}/90</small>
                        </span>
                        <textarea
                          maxLength={90}
                          rows={2}
                          value={dish.description}
                          onChange={(event) =>
                            setDish({
                              ...dish,
                              description: event.target.value,
                            })
                          }
                          placeholder="Cuenta qué lleva o si incluye postre o bebida"
                        />
                      </label>
                      <div className="km-wide km-photo-field">
                        <span>
                          Foto del plato{" "}
                          <span
                            className="km-required"
                            aria-label="obligatorio"
                          >
                            *
                          </span>
                        </span>
                        <button
                          type="button"
                          className="km-outline-button km-upload"
                          disabled={photoBusy}
                          onClick={() => dishPhotoInputRef.current?.click()}
                        >
                          <BrandCameraIcon size={18} />
                          {photoBusy ? "Subiendo…" : "Subir foto"}
                        </button>
                        <input
                          ref={dishPhotoInputRef}
                          type="file"
                          accept="image/png,image/jpeg"
                          hidden
                          disabled={photoBusy}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void changeDishImage(file);
                          }}
                        />
                        <small>PNG o JPG · máximo 2 MB</small>
                        {dish.imageUrl && (
                          <img
                            className="km-dish-preview"
                            src={dish.imageUrl}
                            alt={dish.imageAlt || dish.name}
                          />
                        )}
                      </div>
                      <label className="km-wide">
                        <span className="km-field-label">
                          Texto alternativo de la foto{" "}
                          <small className="km-optional-tag">Opcional</small>
                        </span>
                        <input
                          value={dish.imageAlt}
                          maxLength={120}
                          onChange={(event) =>
                            setDish({ ...dish, imageAlt: event.target.value })
                          }
                          placeholder="Ej. Ají de gallina en envase descartable"
                        />
                      </label>
                      <label className="km-check km-wide">
                        <input
                          type="checkbox"
                          checked={dish.active}
                          onChange={(event) =>
                            setDish({ ...dish, active: event.target.checked })
                          }
                        />{" "}
                        Plato activo para futuros menús
                      </label>
                    </div>
                  ) : (
                    <>
                      <div className="km-dish-summary">
                        <img
                          src={dish.imageUrl}
                          alt={dish.imageAlt || dish.name}
                        />
                        <div>
                          <span className="eyebrow">DATOS DEL PLATO</span>
                          <h3>{dish.name}</h3>
                          <p>{dish.description || "Sin descripción"}</p>
                          <strong>{money(dish.priceSoles)}</strong>
                        </div>
                        <Button
                          type="button"
                          variant="quiet"
                          onClick={() => setDishStep(1)}
                        >
                          Editar datos
                        </Button>
                      </div>
                      <OptionEditor
                        groups={dish.customization}
                        onChange={(customization) =>
                          setDish({ ...dish, customization })
                        }
                        quickCutlery
                      />
                    </>
                  )}
                  <div className="km-form-actions km-dish-actions">
                    {dishStep === 1 && !dish.imageUrl && (
                      <p className="km-hint" role="status">
                        Sube una foto del plato para continuar.
                      </p>
                    )}
                    {dishStep === 2 && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setDishStep(1)}
                      >
                        Volver
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDish(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        busy || photoBusy || (dishStep === 1 && !dish.imageUrl)
                      }
                    >
                      {dishStep === 1
                        ? "Continuar a opciones"
                        : busy
                          ? "Guardando…"
                          : "Guardar plato"}
                    </Button>
                  </div>
                </form>
              )}
              {data.dishes.length ? (
                <div className="km-dish-list">
                  {data.dishes.map((item) => (
                    <KitchenDishCard
                      key={item.id}
                      item={item}
                      onPreview={() => setPreviewDish(item)}
                      onEdit={() => {
                        setDish({
                          ...item,
                          customization: cloneGroups(item.customization),
                        });
                        setDishStep(1);
                        setOffer(null);
                        setCreatedDish(false);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="km-empty">
                  Crea tu primer plato para añadirlo a un menú semanal.
                </div>
              )}
            </div>
          )}
          {section === "menu" && (
            <div className="km-workspace">
              <div className="km-week-controls">
                <div role="group" aria-label="Semana">
                  <button
                    type="button"
                    className={week === 0 ? "active" : ""}
                    onClick={() => setWeek(0)}
                  >
                    Esta semana
                  </button>
                  <button
                    type="button"
                    className={week === 1 ? "active" : ""}
                    onClick={() => setWeek(1)}
                  >
                    Siguiente semana
                  </button>
                </div>
                <span className="km-week-range" aria-live="polite">
                  {dateLabel(weeks[week], {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  –{" "}
                  {dateLabel(weekDate(weeks[week], 5), {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}
                </span>
                <Button
                  onClick={() => {
                    setOffer(
                      blankOffer(data.dishes.find((item) => item.active)?.id),
                    );
                    setDish(null);
                  }}
                  disabled={!data.dishes.some((item) => item.active)}
                >
                  <BrandAddIcon size={18} inverse /> Añadir menú
                </Button>
              </div>
              {!data.dishes.some((item) => item.active) && (
                <p className="km-hint">
                  Crea un plato activo antes de publicar un menú.
                </p>
              )}
              {offer && (
                <form
                  className="km-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save(
                      "/api/kitchen/offers",
                      {
                        ...offer,
                        bookingDeadline: isoFromLocal(offer.bookingDeadline),
                      },
                      () => setOffer(null),
                    );
                  }}
                >
                  <div className="km-editor-head">
                    <h2>{offer.id ? "Editar menú" : "Nuevo menú"}</h2>
                    <button
                      type="button"
                      className="km-icon-button"
                      onClick={() => setOffer(null)}
                      aria-label="Cerrar editor"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="km-form-grid">
                    <KitchenSelect
                      id="offer-dish"
                      label="Plato creado"
                      value={offer.dishId}
                      placeholder="Selecciona un plato"
                      options={data.dishes
                        .filter((item) => item.active)
                        .map((item) => ({ value: item.id, label: item.name }))}
                      onChange={(dishId) => setOffer({ ...offer, dishId })}
                    />
                    <label>
                      Fecha de recojo
                      <input
                        type="date"
                        required
                        min={current}
                        value={offer.date}
                        onChange={(event) =>
                          setOffer({ ...offer, date: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Hora de recojo
                      <input
                        type="time"
                        required
                        value={offer.deliveryTime}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            deliveryTime: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Fin de recojo
                      <input
                        type="time"
                        required
                        value={offer.pickupUntil}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            pickupUntil: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Cierre de reserva
                      <input
                        type="datetime-local"
                        required
                        value={offer.bookingDeadline}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            bookingDeadline: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Porciones disponibles en total
                      <input
                        type="number"
                        required
                        min={Math.max(1, offer.reservedCount)}
                        max={10000}
                        value={offer.capacity}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            capacity: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Precio especial S/ <small>Opcional</small>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step="0.01"
                        value={offer.priceSoles ?? ""}
                        placeholder="Usar precio del plato"
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            priceSoles: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label className="km-wide">
                      Descripción para este día{" "}
                      <small>
                        Opcional · {offer.descriptionOverride?.length || 0}/90
                      </small>
                      <textarea
                        maxLength={90}
                        rows={2}
                        value={offer.descriptionOverride ?? ""}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            descriptionOverride: event.target.value || null,
                          })
                        }
                        placeholder="Si hoy el plato tiene un detalle distinto"
                      />
                    </label>
                  </div>
                  <label className="km-check">
                    <input
                      type="checkbox"
                      checked={offer.hasCustomizationOverride}
                      onChange={(event) =>
                        setOffer({
                          ...offer,
                          hasCustomizationOverride: event.target.checked,
                          customization: event.target.checked
                            ? cloneGroups(
                                data.dishes.find(
                                  (item) => item.id === offer.dishId,
                                )?.customization || [],
                              )
                            : [],
                        })
                      }
                    />{" "}
                    Usar opciones especiales para este menú
                  </label>
                  {offer.hasCustomizationOverride && (
                    <OptionEditor
                      groups={offer.customization}
                      onChange={(customization) =>
                        setOffer({ ...offer, customization })
                      }
                    />
                  )}
                  <div className="km-form-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setOffer(null)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Guardando…" : "Guardar menú"}
                    </Button>
                  </div>
                </form>
              )}
              {visibleOffers.length ? (
                <div className="km-offer-list">
                  {visibleOffers.map((item) => (
                    <KitchenMenuRow
                      key={item.id}
                      offer={item}
                      dish={data.dishes.find((d) => d.id === item.dishId)}
                      onTimeCount={onTimeReservationsForOffer(
                        data.reservations,
                        item,
                      )}
                      deliveredCount={deliveredUnitsForOffer(
                        data.reservations,
                        item.id,
                      )}
                      today={current}
                      reservationsOpen={reservationsOfferId === item.id}
                      onReservations={() =>
                        setReservationsOfferId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                      onEdit={() =>
                        setOffer({
                          ...item,
                          customization: cloneGroups(item.customization),
                          bookingDeadline: localDateTime(item.bookingDeadline),
                        })
                      }
                    />
                  ))}
                  {reservationsOfferId &&
                    data.offers.find(
                      (item) => item.id === reservationsOfferId,
                    ) && (
                      <KitchenReservationPanel
                        offer={data.offers.find(
                          (item) => item.id === reservationsOfferId,
                        )!}
                        reservations={data.reservations.filter(
                          (item) => item.offerId === reservationsOfferId,
                        )}
                        onChanged={refresh}
                        onClose={() => setReservationsOfferId(null)}
                      />
                    )}
                </div>
              ) : (
                <div className="km-empty">
                  No hay menús publicados para esta semana.
                </div>
              )}
            </div>
          )}
          {section === "estadisticas" && <KitchenStats data={data} />}
        </>
      )}
    </section>
  );
}

type AdminOffer = Pick<
  Offer,
  | "id"
  | "date"
  | "deliveryTime"
  | "pickupUntil"
  | "bookingDeadline"
  | "capacity"
  | "reservedCount"
> & {
  kitchenId: string;
  kitchenName: string;
  kitchenLogoUrl: string;
  dishName: string;
  imageUrl: string;
  imageAlt: string;
};
type AdminData = {
  weekStart: string;
  offers: AdminOffer[];
  reservations: KitchenReservation[];
  kitchens: { id: string; name: string }[];
  totalOffers: number;
  limit: number;
  offset: number;
};
type PendingPayment = {
  id: string;
  amountCents: number;
  studentName: string;
  studentEmail: string;
  codes: string;
  orderCount: number;
  proofUploadedAt: string;
};

function AdminPaymentQueue({ payments, onChanged }: { payments: PendingPayment[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  async function review(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    setError("");
    try {
      await request(`/api/admin/payments/${id}/review`, { decision, note: notes[id] || "" });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos revisar el pago.");
    } finally { setBusy(""); }
  }
  return <section className="admin-payment-queue" aria-label="Yapes por verificar">
    <div className="admin-payment-head"><span className="eyebrow">PAGOS DE RESERVAS PREVIAS</span><h2>Yapes por verificar</h2><p>Comprueba el movimiento en la cuenta de Fernando, el monto y el código de seguridad antes de aprobar. La captura por sí sola no confirma el pago.</p></div>
    {error && <p className="km-alert" role="alert">{error}</p>}
    {payments.length ? payments.map((payment) => <article className="admin-payment-card" key={payment.id}>
      <div><strong>{payment.studentName}</strong><span>{payment.studentEmail}</span><small>{payment.codes} · {payment.orderCount} {payment.orderCount === 1 ? "pedido" : "pedidos"}</small></div>
      <strong>{money(payment.amountCents / 100)}</strong>
      <a href={`/api/payments/${payment.id}/proof`} target="_blank" rel="noreferrer">Ver comprobante</a>
      <label>Motivo de rechazo<input value={notes[payment.id] || ""} maxLength={300} onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))} placeholder="Solo si rechazas" /></label>
      <div className="admin-payment-actions"><Button variant="secondary" disabled={!!busy} onClick={() => review(payment.id, "rejected")}>Rechazar</Button><Button disabled={!!busy} onClick={() => review(payment.id, "approved")}>{busy === payment.id ? "Guardando…" : "Aprobar Yape"}</Button></div>
    </article>) : <p className="km-empty">No hay pagos anticipados por revisar.</p>}
  </section>;
}

function AdminOfferRow({
  offer,
  reservations,
  expanded,
  onToggle,
  onChanged,
}: {
  offer: AdminOffer;
  reservations: KitchenReservation[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [capacity, setCapacity] = useState(String(offer.capacity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setCapacity(String(offer.capacity)), [offer.capacity]);
  const active = reservations.filter(
    (item) =>
      item.status === "reservado" && item.fulfillmentStatus !== "no_show",
  );
  async function saveCapacity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/offers/capacity", {
        offerId: offer.id,
        capacity: Number(capacity),
      });
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos cambiar el cupo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-offer-group">
      <article className="admin-offer-row">
        <img
          src={offer.imageUrl || "/images/menuu-logo.png"}
          alt={offer.imageAlt || offer.dishName}
        />
        <div className="admin-offer-copy">
          <span className="admin-kitchen-name">{offer.kitchenName}</span>
          <h2>{offer.dishName}</h2>
          <p>
            {dateLabel(offer.date, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}{" "}
            · {timeLabel(offer.deliveryTime)}–{timeLabel(offer.pickupUntil)}
          </p>
        </div>
        <div className="admin-offer-count">
          <strong>
            {active.length} {active.length === 1 ? "pedido" : "pedidos"}
          </strong>
          <span>
            {offer.reservedCount} de {offer.capacity} porciones ocupadas
          </span>
        </div>
        <form className="admin-capacity" onSubmit={saveCapacity}>
          <label htmlFor={`admin-capacity-${offer.id}`}>Cupo</label>
          <div>
            <input
              id={`admin-capacity-${offer.id}`}
              type="number"
              min={Math.max(1, offer.reservedCount)}
              max="10000"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || Number(capacity) === offer.capacity}
            >
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
        <Button
          type="button"
          variant="quiet"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? "Cerrar entregas" : "Entregas"}
        </Button>
      </article>
      {error && (
        <p className="km-reservations-error" role="alert">
          {error}
        </p>
      )}
      {expanded && (
        <KitchenReservationPanel
          offer={offer}
          reservations={reservations}
          onChanged={onChanged}
          onClose={onToggle}
          apiPrefix="/api/admin"
        />
      )}
    </div>
  );
}

export function AdminDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [error, setError] = useState("");
  const [week, setWeek] = useState(0);
  const [kitchen, setKitchen] = useState("all");
  const [adminPage, setAdminPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const adminQuery = `/api/admin/data?week=${week}&kitchen=${encodeURIComponent(kitchen)}&limit=10&offset=${adminPage * 10}`;
  const refresh = async (force = true) => {
    if (force) invalidateCache("admin:data:");
    const [next, paymentResult] = await Promise.all([
      cachedRequest(`admin:data:${adminQuery}`,
        () => request<AdminData>(adminQuery), 30_000, force),
      request<{ payments: PendingPayment[] }>("/api/admin/payments"),
    ]);
    setData(next);
    setPayments(paymentResult.payments);
    setError("");
  };
  useEffect(() => {
    refresh(true).catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos cargar los pedidos.",
      ),
    );
  }, [user.id, week, kitchen, adminPage]);
  useEffect(() => {
    const update = () => {
      if (!document.hidden)
        Promise.all([request<AdminData>(adminQuery), request<{ payments: PendingPayment[] }>("/api/admin/payments")])
          .then(([next, result]) => { setData(next); setPayments(result.payments); })
          .catch(() => {});
    };
    const timer = window.setInterval(update, 45_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [user.id, adminQuery]);
  const kitchens = data?.kitchens || [];
  const start = data ? weekDate(data.weekStart, week * 7) : "";
  const end = data ? weekDate(data.weekStart, week * 7 + 5) : "";
  const visible = data?.offers || [];
  return (
    <section
      className="page-section admin-dashboard"
      aria-label="Panel de administración"
    >
      <div className="page-heading admin-heading">
        <div>
          <span className="eyebrow">OPERACIÓN DE MENÚU</span>
          <h1>Pedidos y entregas</h1>
          <p>{user.email}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onLogout}>
          <BrandLogoutIcon size={18} /> Cerrar sesión
        </Button>
      </div>
      {error && (
        <p className="km-alert" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p className="km-loading" role="status">
          Cargando pedidos…
        </p>
      ) : (
        <div className="km-workspace">
          <AdminPaymentQueue payments={payments} onChanged={() => refresh(true)} />
          <div className="admin-controls">
            <div className="km-week-controls">
              <div role="group" aria-label="Semana">
                <button
                  type="button"
                  className={week === 0 ? "active" : ""}
                  onClick={() => {
                    setWeek(0);
                    setAdminPage(0);
                    setExpanded(null);
                  }}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  className={week === 1 ? "active" : ""}
                  onClick={() => {
                    setWeek(1);
                    setAdminPage(0);
                    setExpanded(null);
                  }}
                >
                  Próxima semana
                </button>
              </div>
              <span className="km-week-range">
                {dateLabel(start, { day: "numeric", month: "short" })} –{" "}
                {dateLabel(end, { day: "numeric", month: "short" })}
              </span>
            </div>
            <label className="admin-kitchen-filter">
              Cocina
              <select
                value={kitchen}
                onChange={(event) => {
                  setKitchen(event.target.value);
                  setAdminPage(0);
                  setExpanded(null);
                }}
              >
                <option value="all">Todas las cocinas</option>
                {kitchens.map(({ id, name }) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                refresh().catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "No pudimos actualizar.",
                  ),
                )
              }
            >
              Actualizar pedidos
            </Button>
          </div>
          <p className="admin-summary">
            {data.totalOffers} {data.totalOffers === 1 ? "menú" : "menús"} en esta selección ·{" "}
            {visible.reduce(
              (sum, offer) =>
                sum +
                data.reservations.filter(
                  (item) =>
                    item.offerId === offer.id &&
                    item.status === "reservado" &&
                    item.fulfillmentStatus !== "no_show",
                ).length,
              0,
            )}{" "}
            pedidos activos en esta página
          </p>
          {visible.length ? (
            visible.map((offer) => (
              <AdminOfferRow
                key={offer.id}
                offer={offer}
                reservations={data.reservations.filter(
                  (item) => item.offerId === offer.id,
                )}
                expanded={expanded === offer.id}
                onToggle={() =>
                  setExpanded((current) =>
                    current === offer.id ? null : offer.id,
                  )
                }
                onChanged={refresh}
              />
            ))
          ) : (
            <p className="km-empty">
              No hay menús de esta cocina en la semana seleccionada.
            </p>
          )}
          {data.totalOffers > 10 && (
            <nav className="km-pagination" aria-label="Páginas de menús en Admin">
              <Button type="button" variant="secondary" disabled={adminPage === 0}
                onClick={() => { setAdminPage((page) => page - 1); setExpanded(null); }}>Anterior</Button>
              <span>Página {adminPage + 1} de {Math.ceil(data.totalOffers / 10)}</span>
              <Button type="button" variant="secondary"
                disabled={(adminPage + 1) * 10 >= data.totalOffers}
                onClick={() => { setAdminPage((page) => page + 1); setExpanded(null); }}>Siguiente</Button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
