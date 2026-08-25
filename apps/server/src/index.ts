import './assertEnv.ts';
import { createServer } from './app.ts';

const PORT = Number(process.env.PORT ?? 2567);

createServer().listen(PORT);
console.log(`Kinglier server listening on :${PORT}`);
