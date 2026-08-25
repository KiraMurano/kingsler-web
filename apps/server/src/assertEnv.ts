// Imported first (before ./app.ts) in index.ts so this check runs before any
// module that calls JWT.middleware() at load time — ESM import evaluation is
// depth-first in declaration order, so a later import can't "go back" and
// validate env vars before an earlier one already ran.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
