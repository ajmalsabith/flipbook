// Watermarks, preview cards and the demo pages are SVG text drawn by sharp
// (librsvg + fontconfig). A server without any fonts installed would draw no
// text at all, so the app ships DejaVu (npm "dejavu-fonts-ttf") and points
// fontconfig at it, together with the system's own fonts when there are any.
// Must run before the first image with text is drawn (fontconfig reads
// FONTCONFIG_FILE once, on first use). Not needed on Windows.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

if (process.platform !== "win32" && !process.env.FONTCONFIG_FILE) {
  try {
    const require = createRequire(import.meta.url);
    const fontDir = join(dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");
    // Per user: the service user and root (seed script) each get their own.
    const dir = join(tmpdir(), `amflipbook-fontconfig-${process.getuid?.() ?? 0}`);
    mkdirSync(join(dir, "cache"), { recursive: true });
    const file = join(dir, "fonts.conf");
    writeFileSync(
      file,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>${fontDir}</dir>
  <cachedir>${join(dir, "cache")}</cachedir>
</fontconfig>
`
    );
    process.env.FONTCONFIG_FILE = file;
  } catch (err) {
    console.warn("[fonts] bundled fonts not set up; watermark text needs fonts on this server:", err);
  }
}
