import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/**
 * Brand mark: a speech bubble with a play cutout. The cutout uses `evenodd`,
 * so the mark works on any colored surface (it shows the surface through).
 * Keep it in sync with `public/icons/icon.svg`.
 */
export function BrandMarkIcon({ width = 16, height = 16, ...props }: IconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 3h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-6.3l-3.6 3.4c-.6.6-1.6.2-1.6-.7V17A4 4 0 0 1 2 13V7a4 4 0 0 1 4-4Zm3.8 4.1c-.4-.2-.8.1-.8.5v4.8c0 .4.4.7.8.5l4.4-2.4c.4-.2.4-.8 0-1l-4.4-2.4Z"
      />
    </svg>
  );
}
