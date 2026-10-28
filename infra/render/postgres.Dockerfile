# Render runs PostgreSQL as a private service on its own disk. The image carries the
# same role bootstrap as Compose and AKS, so the database roles stay separated.
FROM postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929
COPY infra/postgres/01-roles.sql /docker-entrypoint-initdb.d/01-roles.sql
