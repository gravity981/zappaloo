// The icons of the website frame (UX mock `site`); the outlines are in siteIconPaths.ts.

export function SiteIcon({ path }: { path: string }) {
  return (
    <svg
      className="site-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
