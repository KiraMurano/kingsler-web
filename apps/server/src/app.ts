import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';
import { KinglierRoom } from './KinglierRoom.ts';
import { authRouter, meRouter } from './auth/routes.ts';
import { cacheHeaders } from './staticCache.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

export function createServer() {
  return defineServer({
    rooms: {
      kinglier: defineRoom(KinglierRoom)
    },
    express: app => {
      // The web app (Vite dev server) and the API run on different ports/
      // origins in development, so plain fetch() from the browser needs
      // CORS headers here. In production they're same-origin and this is a
      // harmless no-op. `credentials: true` is required because the SDK's
      // HTTP client always sends `credentials: "include"`.
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', req.headers.origin ?? '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        if (req.method === 'OPTIONS') {
          res.sendStatus(204);
          return;
        }
        next();
      });
      app.use(express.json());
      app.use('/api/auth', authRouter);
      app.use(meRouter);
      app.use(express.static(WEB_DIST, { setHeaders: cacheHeaders }));
    }
  });
}
