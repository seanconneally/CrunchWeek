async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: `Request failed (${response.status}).` }));
    const detail = Array.isArray(data.detail)
      ? data.detail
          .map(
            (item: { field?: string; message?: string }) =>
              `${item.field ?? ""}: ${item.message ?? "Invalid value"}`,
          )
          .join("; ")
      : data.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Request failed. Please retry.",
    );
  }
  return response;
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await checked(
    await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      signal,
      headers: { "Content-Type": "application/json", "X-Crunch-Week": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return response.json() as Promise<T>;
}
export async function upload<T>(data: FormData): Promise<T> {
  return (
    await checked(
      await fetch("/api/extract", {
        method: "POST",
        headers: { "X-Crunch-Week": "1" },
        body: data,
      }),
    )
  ).json();
}
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function download(
  kind: "csv" | "ics",
  project: unknown,
): Promise<void> {
  const response = await checked(
    await fetch(`/api/exports/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Crunch-Week": "1" },
      body: JSON.stringify(project),
    }),
  );
  saveBlob(await response.blob(), `crunch-week.${kind}`);
}
export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
