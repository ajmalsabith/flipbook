import type { ApiErrorBody } from "@shared/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody
  ) {
    super(body.message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = {
      error: `http_${res.status}`,
      message:
        res.status === 413
          ? "The upload is too large."
          : "Something went wrong. Please check your connection and try again.",
    };
  }
  return new ApiError(res.status, body);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, { error: "network", message: "Could not reach the server. Check your connection." });
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** Downloads a file from a POST endpoint, keeping the server's file name. */
export async function downloadFile(path: string): Promise<{ fileName: string; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin" });
  } catch {
    throw new ApiError(0, { error: "network", message: "Could not reach the server. Check your connection." });
  }
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const fileName = decodeURIComponent(match?.[1] ?? match?.[2] ?? "flipbook.html");
  saveBlob(blob, fileName);
  return { fileName, headers: res.headers };
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
