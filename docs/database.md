# Database

The project uses MySQL with `mysql2` (no ORM). Tables are created from `server/init.sql` when the MySQL container starts for the first time.

## How tables are created

- The MySQL container runs `server/init.sql` on first initialization.
- To apply schema changes during development, update `server/init.sql` and recreate the volume.
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

Place the placeholder file in the client assets folder:

```
client/assets/default-avatar.svg
```

When rendering, the frontend can use `user.avatar || '/assets/default-avatar.svg'`.
