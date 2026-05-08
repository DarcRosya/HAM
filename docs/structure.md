# Project Structure

This repository is split into a React client and an Express server.

## / (root)

- docker-compose.yml - MySQL container for local development.

## /client

- index.html - Vite HTML entry.
- src/
  - App.jsx - root React component.
  - main.jsx - app bootstrap.
  - components/ - UI blocks (Card, Hand, Table, Avatar).
  - pages/ - screens and routes.
  - services/ - API and socket helpers.
  - styles/ - global CSS and CSS Modules.

## /server

- server.js - Express + Socket.io entry.
- init.sql - schema bootstrap for MySQL.
- src/
  - config/ - env, DB pool, and constants.
  - controllers/ - HTTP handlers.
  - repositories/ - data access via mysql2 pool queries.
  - middlewares/ - auth, validation, error handling.
  - game/ - core game rules and state.

## Environment Variables (server)

- PORT
- CLIENT_ORIGIN
- DB_HOST
- DB_PORT
- DB_USER
- DB_PASSWORD
- DB_NAME
- DB_SYNC_ALTER
- JWT_SECRET
