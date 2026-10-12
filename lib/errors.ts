/** An error whose message is safe and useful to show to the person using the site. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on the server. Try again in a moment." }, { status: 500 });
}

export function errorMessage(e: unknown): string {
  return e instanceof AppError ? e.message : "Couldn't load the committee. Try refreshing the page.";
}
