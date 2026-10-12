import { useId } from "react";

const LIME = "#c5f135";

export function Logo() {
  const clipId = useId();
  return (
    <span className="flex flex-col items-center gap-[7px] text-white">
      <svg
        viewBox="0 0 312 120"
        className="h-auto w-[132px]"
        role="img"
        aria-label="EPI"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="60" cy="60" r="51.5" />
          </clipPath>
        </defs>
        <path
          d="M22.3 86.4A46 46 0 0 1 83 20.2"
          fill="none"
          stroke={LIME}
          strokeWidth="11"
        />
        <g clipPath={`url(#${clipId})`}>
          <rect x="35" y="76" width="15" height="50" rx="3" fill="#fff" />
          <rect x="56" y="55" width="15" height="70" rx="3" fill={LIME} />
          <rect x="77" y="34" width="15" height="90" rx="3" fill={LIME} />
        </g>
        <g fill="#fff">
          <path d="M142 25h62v15h-46v12.5h40v15h-40V80h46v15h-62z" />
          <path
            fillRule="evenodd"
            d="M218 25h50a14 14 0 0 1 14 14v15a14 14 0 0 1-14 14h-34v27h-16zM234 40h30a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-30z"
          />
          <path d="M296 25h16v70h-16z" />
        </g>
      </svg>
      <span className="whitespace-nowrap text-[8.5px] font-semibold leading-none tracking-[0.1em]">
        EVOLET PHARMA INTELLIGENCE
      </span>
      <span className="whitespace-nowrap text-[8.5px] leading-none tracking-[0.06em] text-ink-fg-2">
        Market Data. Strategic Decisions.
      </span>
    </span>
  );
}
