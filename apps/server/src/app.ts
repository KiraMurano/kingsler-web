import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';
import { KinglierRoom } from './KinglierRoom.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

export function createServer() {
  return defineServer({
    rooms: {
      kinglier: defineRoom(KinglierRoom)
    },
    express: app => {
      app.use(express.static(WEB_DIST));
    }
  });
}
