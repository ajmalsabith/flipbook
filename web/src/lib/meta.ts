import { useEffect } from "react";
import { brandName } from "@shared/theme";

/** Sets the page title and meta description for the current route. */
export function usePageMeta(title: string | null, description?: string, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    document.title = title ? `${title} · ${brandName}` : `${brandName} – Turn any PDF into a page-turning flipbook`;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    }
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (opts.noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex";
    } else {
      robots?.remove();
    }
  }, [title, description, opts.noindex]);
}
