export default function Logo({ size = 36, withText = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#F2A93B" />
        <g fill="#FFFFFF">
          <rect x="12" y="20" width="9" height="12" rx="2" /><rect x="24" y="15" width="9" height="17" rx="2" /><rect x="36" y="22" width="9" height="10" rx="2" />
          <rect x="9" y="33" width="46" height="4" rx="2" />
          <rect x="14" y="41" width="12" height="9" rx="2" /><rect x="29" y="43" width="8" height="7" rx="2" /><rect x="40" y="39" width="10" height="11" rx="2" />
          <rect x="9" y="51" width="46" height="4" rx="2" />
        </g>
        <path d="M47 12l-4 8h5l-3 7" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && <span className="text-lg font-extrabold tracking-tight">SwiftShelf<span className="text-accent"> POS</span></span>}
    </span>
  );
}
