export type Choice = { id: string; label: string; priceSoles: number };
export type CustomizationGroup = {
  id: string;
  title: string;
  selectionType?: "single" | "multiple";
  required: boolean;
  maxSelections?: number | null;
  choices: Choice[];
};
export function optionRules(group: CustomizationGroup): {
  selectionType: "single" | "multiple";
  maxSelections: number | null;
} {
  const selectionType =
    group.selectionType === "multiple" ? "multiple" : "single";
  const maxSelections =
    selectionType === "single"
      ? 1
      : typeof group.maxSelections === "number" &&
          Number.isInteger(group.maxSelections) &&
          group.maxSelections > 0
        ? group.maxSelections
        : null;
  return { selectionType, maxSelections };
}
export type SelectedChoices = Record<string, string[]>;
export type Offering = {
  id: string;
  dishId: string;
  kitchenId: string;
  kitchenName: string;
  date: string;
  deliveryTime: string;
  pickupUntil: string;
  bookingDeadline: string;
  capacity: number;
  remaining: number;
  bookable: boolean;
  week: number;
  sortOrder: number;
  name: string;
  description: string;
  priceSoles: number;
  imageUrl: string;
  imageAlt: string;
  customization: CustomizationGroup[];
};
export type Kitchen = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  logoUrl: string;
  rating: number | null;
  ratingCount: number;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "consumer" | "kitchen" | "admin";
  kitchenId?: string;
  studentCode: string | null;
  career: string | null;
  birthDate: string | null;
  bookingAllowed: boolean;
};
export type Selection = {
  groupId: string;
  title: string;
  choiceId: string;
  label: string;
  priceSoles: number;
};
export type CartItem = {
  key: string;
  offeringId: string;
  choices: SelectedChoices;
  comment: string;
  quantity: number;
};
export type OrderItem = {
  id: string;
  offeringId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  choices: Selection[];
  comment?: string;
  unitPriceSoles: number;
  totalSoles: number;
  foodRating: number | null;
};
export type Order = {
  id: string;
  code: string;
  kitchenName: string;
  date: string;
  deliveryTime: string;
  pickupUntil: string;
  pickupPoint: string;
  status: string;
  fulfillmentStatus: "pending" | "delivered" | "no_show";
  reviewEnabled: boolean;
  kitchenRating: number | null;
  kitchenComment: string | null;
  fridgeAt: string | null;
  fridgePhone: string | null;
  fridgePhotoUrl: string | null;
  payment: string;
  paymentCheckoutId: string | null;
  paymentStatus: "awaiting_proof" | "under_review" | "approved" | "rejected" | "expired" | null;
  paymentExpiresAt: string | null;
  paymentReviewNote: string | null;
  paymentAmountSoles: number | null;
  items: OrderItem[];
  totalSoles: number;
  createdAt: string;
};
export type Bootstrap = {
  user: User | null;
  careers: string[];
  catalog: {
    kitchens: Kitchen[];
    weeks: string[];
    offerings: Offering[];
    sales: { kitchenId: string; dishId: string; units: number }[];
    weeklyDishSales: {
      week: number;
      kitchenId: string;
      dishId: string;
      units: number;
      orderCount: number;
    }[];
  };
  orders: Order[];
};

export const money = (amount: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    amount,
  );
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", ...options }).format(
    new Date(`${date}T12:00:00Z`),
  );

export function limaDayIndex(now = new Date()): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = new Date(
    `${value("year")}-${value("month")}-${value("day")}T12:00:00Z`,
  ).getUTCDay();
  return weekday === 0 ? null : weekday - 1;
}

export function weekDate(start: string, dayIndex: number): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.toISOString().slice(0, 10);
}

export function nextBookableDate(
  offerings: Pick<Offering, "date" | "bookable">[],
  today: string,
): string | null {
  return offerings.reduce<string | null>(
    (next, offer) =>
      offer.bookable && offer.date >= today && (!next || offer.date < next)
        ? offer.date
        : next,
    null,
  );
}

export function nextHomeMenuDate(
  offerings: Pick<Offering, "date" | "bookable" | "remaining">[],
  today: string,
  limaHour: number,
): string | null {
  if (limaHour >= 16) return nextBookableDate(offerings, weekDate(today, 1));
  if (offerings.some((offer) => offer.date === today && offer.remaining > 0))
    return today;
  return nextBookableDate(offerings, today);
}

export function timeLabel(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}\u00a0${hour >= 12 ? "p.m." : "a.m."}`;
}

export function pickupWindow(start: string, end: string): string {
  return `${timeLabel(start).split("\u00a0")[0]}–${timeLabel(end)}`;
}

export function bookingDeadlineLabel(value: string): string {
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
    parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return `${dateLabel(date, { weekday: "short", day: "numeric", month: "short" })} · ${timeLabel(`${part("hour")}:${part("minute")}`)}`;
}
