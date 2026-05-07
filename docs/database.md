# Database and ORM

The project uses Sequelize (ORM) with MySQL. Tables are created automatically on server start.

## How tables are created

- The server runs `sequelize.sync()` on startup.
- To apply schema changes during development, set `DB_SYNC_ALTER=true` and restart the server.
- For a clean rebuild, stop containers and remove the volume:

```bash
docker compose down -v
```

Then start again:

```bash
docker compose up -d --build
```

## Default avatar

The default avatar path stored in the DB is:

```
/assets/default-avatar.svg
```

Place the placeholder file in the client public assets folder:

```
client/public/assets/default-avatar.svg
```

When rendering, the frontend can use `user.avatar || '/assets/default-avatar.svg'`.
