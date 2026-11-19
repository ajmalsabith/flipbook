import { LinkButton } from "../components/ui";
import { usePageMeta } from "../lib/meta";

export default function NotFoundPage() {
  usePageMeta("Page not found", undefined, { noindex: true });
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      <p className="text-7xl font-extrabold tracking-tight text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink-900">This page doesn't exist</h1>
      <p className="mt-2 text-ink-600">The link may be wrong or the page may have moved.</p>
      <div className="mt-8 flex gap-3">
        <LinkButton to="/">Home</LinkButton>
        <LinkButton to="/create" variant="secondary">
          Make a flipbook
        </LinkButton>
      </div>
    </div>
  );
}
