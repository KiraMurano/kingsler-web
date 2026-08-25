import { createServer } from './app.ts';

const PORT = Number(process.env.PORT ?? 2567);

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

createServer().listen(PORT);
console.log(`Kinglier server listening on :${PORT}`);
