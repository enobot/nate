import { useId } from "react";

/** "NH" hexagon logo (same design as public/favicon.svg). Decorative only. */
export default function Monogram({ className = "size-8" }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b26bff" />
          <stop offset="0.5" stopColor="#3d7bff" />
          <stop offset="1" stopColor="#22e3f5" />
        </linearGradient>
      </defs>
      <polygon
        points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
        fill="#070b1c"
        stroke={`url(#${gradientId})`}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M18 42 V22 L29 42 V22 M35 22 V42 M46 22 V42 M35 32 H46"
        fill="none"
        stroke="#e8f9ff"
        strokeWidth="4"
        strokeLinecap="square"
      />
    </svg>
  );
}
