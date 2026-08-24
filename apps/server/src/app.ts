import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineServer } from 'colyseus';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

export function createServer() {
  return defineServer({
    rooms: {
      // Room registration is added in Task 6.
    },
    express: app => {
      app.use(express.static(WEB_DIST));
    }
  });
}
