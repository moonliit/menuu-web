type BrandIconProps = {
  size?: number;
  strokeWidth?: number;
  inverse?: boolean;
};

export function BrandLocationIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M24 5c-9.1 0-16 6.8-16 15.7C8 31.1 24 43 24 43s16-11.9 16-22.3C40 11.8 33.1 5 24 5Z"
        fill="var(--color-brand)"
      />
      <circle cx="24" cy="21" r="6" fill="var(--color-orange-display)" />
    </svg>
  );
}

export function BrandCartIcon({ size = 22, inverse = false }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 3.2h2.3c.9 0 1.7.6 1.9 1.5l2.5 10.8c.2.8.9 1.4 1.7 1.4h8.5v1.9h-8.5c-1.7 0-3.1-1.1-3.5-2.8L4.3 5.1H2z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M6.1 7h14.6l-1.5 6.3a2.2 2.2 0 0 1-2.1 1.7H9.2a2.2 2.2 0 0 1-2.1-1.7L5.7 7z"
        fill={inverse ? "var(--color-background)" : "var(--color-brand)"}
      />
      <circle cx="10.5" cy="21" r="1.6" fill="var(--color-orange-display)" />
      <circle cx="18.1" cy="21" r="1.6" fill="var(--color-orange-display)" />
    </svg>
  );
}

export function BrandOrderBagIcon({ size = 30 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 8V6a5 5 0 0 1 10 0v2"
        stroke="var(--color-orange-display)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M4 8h16l1 13H3L4 8Z" fill="var(--color-brand)" />
      <path d="M9 14h6v2H9z" fill="var(--color-orange-soft)" />
    </svg>
  );
}

export function BrandStoreIcon({ size = 20 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 10h14v11H5z" fill="var(--color-brand)" />
      <path
        d="M4 4h16l2 6c-.9 1.4-3 1.7-4.2.4-1.1 1.5-3.4 1.5-4.5 0-1.1 1.5-3.4 1.5-4.5 0C6.6 11.7 4.5 11.4 3 10z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M8 14h3.2v7H8zm5.5 0H17v3.4h-3.5z"
        fill="var(--color-background)"
      />
    </svg>
  );
}

export function BrandClockIcon({ size = 20 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="var(--color-brand)" />
      <path
        d="M11 6h2v5.7l4.1 2.5-1.1 1.8-5-3.1z"
        fill="var(--color-orange-soft)"
      />
    </svg>
  );
}

export function BrandCalendarIcon({
  size = 20,
  inverse = false,
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2"
        y="4"
        width="20"
        height="18"
        rx="3"
        fill={inverse ? "var(--color-background)" : "var(--color-brand)"}
      />
      <path
        d="M2 7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3H2z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M7 2v4M17 2v4"
        stroke={inverse ? "var(--color-background)" : "var(--color-brand)"}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M7 13h3v3H7zm7 0h3v3h-3zm-7 5h3v2H7z"
        fill={inverse ? "var(--color-brand)" : "var(--color-background)"}
      />
    </svg>
  );
}

export function BrandOrdersIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="4.5"
        y="4"
        width="15"
        height="18"
        rx="2.4"
        fill="var(--color-brand)"
      />
      <path
        d="M9 2h6a1 1 0 0 1 1 1v3H8V3a1 1 0 0 1 1-1z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M8 10h8v1.7H8zm0 4h8v1.7H8zm0 4h5.5v1.7H8z"
        fill="var(--color-background)"
      />
    </svg>
  );
}

export function BrandLockedOrdersIcon({ size = 30 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="3"
        width="15"
        height="19"
        rx="2.4"
        fill="var(--color-brand)"
      />
      <path
        d="M7 2h7a1 1 0 0 1 1 1v3H6V3a1 1 0 0 1 1-1z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M6.5 10h8v1.8h-8zm0 4h6v1.8h-6z"
        fill="var(--color-background)"
      />
      <path
        d="M16 14.5v-1a2.5 2.5 0 0 1 5 0v1"
        stroke="var(--color-orange-display)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="15"
        y="14"
        width="7"
        height="7"
        rx="1.5"
        fill="var(--color-orange-display)"
      />
      <circle cx="18.5" cy="17.5" r=".9" fill="var(--color-brand)" />
    </svg>
  );
}

export function BrandLogoutIcon({ size = 18 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 3h11v18h-11z" fill="var(--color-brand)" />
      <circle cx="11.6" cy="12" r="1.1" fill="var(--color-orange-soft)" />
      <path
        d="M14 11h5.2l-2-2 1.5-1.5L23 12l-4.3 4.5-1.5-1.5 2-2H14z"
        fill="var(--color-orange-display)"
      />
    </svg>
  );
}

export function BrandDishIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 10h16l-1.5 10.2A2 2 0 0 1 16.5 22h-9a2 2 0 0 1-2-1.8L4 10Z"
        fill="var(--color-brand)"
      />
      <path
        d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h15a1.5 1.5 0 0 1 0 3h-15A1.5 1.5 0 0 1 3 8.5Z"
        fill="var(--color-orange-display)"
      />
      <path
        d="M8 5c0-1.4 1-2.1 1-3M12 5c0-1.4 1-2.1 1-3M16 5c0-1.4 1-2.1 1-3"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M9 14h6v2H9z" fill="var(--color-background)" />
    </svg>
  );
}

export function BrandStatsIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 20h18v2H3z" fill="var(--color-brand)" />
      <rect
        x="4"
        y="12"
        width="4"
        height="8"
        rx="1"
        fill="var(--color-brand)"
      />
      <rect
        x="10"
        y="8"
        width="4"
        height="12"
        rx="1"
        fill="var(--color-orange-display)"
      />
      <rect
        x="16"
        y="3"
        width="4"
        height="17"
        rx="1"
        fill="var(--color-brand)"
      />
    </svg>
  );
}

export function BrandAccountIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="7" r="4.5" fill="var(--color-brand)" />
      <path d="M3 21a9 9 0 0 1 18 0v1H3z" fill="var(--color-brand)" />
      <circle cx="18.5" cy="17.5" r="2.5" fill="var(--color-orange-display)" />
    </svg>
  );
}

export function BrandCameraIcon({ size = 18 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 4h6l1.7 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.3L7 4Z"
        fill="var(--color-brand)"
      />
      <circle cx="12" cy="13" r="4.6" fill="var(--color-background)" />
      <circle cx="12" cy="13" r="2.6" fill="var(--color-orange-display)" />
    </svg>
  );
}

export function BrandAddIcon({ size = 18, inverse = false }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill={inverse ? "var(--color-background)" : "var(--color-brand)"}
      />
      <path
        d="M11 6.5h2v4.5h4.5v2H13v4.5h-2V13H6.5v-2H11z"
        fill={inverse ? "var(--color-brand)" : "var(--color-background)"}
      />
    </svg>
  );
}

export function BrandDeleteIcon({ size = 18 }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 7h14l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7Z"
        fill="var(--color-brand)"
      />
      <path d="M3 5h18v2H3zM9 2h6l1 3H8z" fill="var(--color-orange-display)" />
      <path
        d="M10 11v7M14 11v7"
        stroke="var(--color-background)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandGoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}
