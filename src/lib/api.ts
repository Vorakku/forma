export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: { path: string; message: string }[] = [],
  ) {
    super(
      [
        message,
        ...fields.map((field) => `${field.path}: ${field.message}`),
      ].join(" "),
    );
  }
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/store" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Store-Key": import.meta.env?.VITE_STORE_KEY ?? "pk_forma_dev",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const content = await response
      .json()
      .catch(() => ({ error: "The server returned an unexpected response." }));
    if (!response.ok)
      throw new ApiError(
        content.error ?? "This operation could not be completed.",
        response.status,
        content.fields,
      );
    return content;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        "The request timed out. Check your connection and try again.",
      );
    throw new Error(
      "Unable to connect. Your input is still here; please try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
