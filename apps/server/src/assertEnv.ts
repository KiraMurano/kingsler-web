// Imported first (before ./app.ts) in index.ts so this check runs before any
// module that calls JWT.middleware() at load time — ESM import evaluation is
// depth-first in declaration order, so a later import can't "go back" and
// validate env vars before an earlier one already ran.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required');
  }
  // Local dev only (the Docker image always sets NODE_ENV=production):
  // fall back to a fixed, publicly-known secret instead of forcing every
  // `npm run dev:server` invocation to export one.
  process.env.JWT_SECRET = 'dev-insecure-secret-do-not-use-in-production';
  console.warn(
    "⚠️  JWT_SECRET not set — using an insecure dev default. Never rely on this outside local dev."
  );
}
