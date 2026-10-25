\getenv app_password PG_APP_PASSWORD
\getenv executor_password PG_EXECUTOR_PASSWORD
CREATE ROLE swarm_app LOGIN PASSWORD :'app_password';
CREATE ROLE swarm_executor LOGIN PASSWORD :'executor_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA commerce AUTHORIZATION swarm_app;
CREATE SCHEMA payments AUTHORIZATION swarm_executor;
GRANT USAGE ON SCHEMA commerce TO swarm_executor;
ALTER DEFAULT PRIVILEGES FOR ROLE swarm_app IN SCHEMA commerce GRANT SELECT ON TABLES TO swarm_executor;
ALTER ROLE swarm_app SET search_path TO commerce;
ALTER ROLE swarm_executor SET search_path TO payments;
