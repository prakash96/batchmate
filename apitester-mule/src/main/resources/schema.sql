-- apitester-mule schema — Oracle ONLY (see pom.xml's file comment; no H2/PostgreSQL/MySQL
-- support anywhere in this app). Complex nested config (pre-request/postResponse step lists,
-- request bodies/headers, run results) is kept as JSON text (CLOB) columns rather than fully
-- normalized — this data is always read/written as one whole blob per request/run anyway (never
-- queried by subfield, in apitester-app's own flat-JSON-file design either), so normalizing every
-- step type into its own relational table would add a lot of relational-modeling complexity for
-- no real query benefit.
--
-- Unlike H2, Oracle has no "run this script automatically on first connect" JDBC URL trick and no
-- CREATE TABLE/INDEX ... IF NOT EXISTS (pre-23c) — this is a one-time manual setup script. Run it
-- once against your target Oracle schema/user before first deploying the app (sqlplus, SQL
-- Developer, whatever you'd normally use), NOT something the app runs itself on startup.

-- Top-level scope above collections — password_hash: SHA-256 hex digest (64 chars), NULL = no
-- password. Replaces collections' OWN password_hash entirely (a workspace's password now gates
-- ALL its collections at once, instead of each collection needing its own) — enforced in
-- workspaces-api.xml's get-workspaces/unlock-workspace and collections-api.xml's get-collections
-- (a collection whose workspace is locked is entirely absent from GET /collections, not merely
-- hidden — see those flows' own comments for the exact contract).
CREATE TABLE workspaces (
    id            VARCHAR2(64) PRIMARY KEY,
    name          VARCHAR2(255) NOT NULL,
    password_hash VARCHAR2(64) NULL
);

-- ON DELETE CASCADE everywhere below — deleting a workspace or collection now genuinely removes
-- everything under it (sub-collections, requests, their run_logs, that collection's
-- run_all_reports row, that workspace's global_vars) in ONE db:delete on the parent row; the app
-- flows (collections-api.xml's delete-collection, workspaces-api.xml's delete-workspace) don't
-- manually detach/delete children themselves anymore — the DB does it. A collection created with
-- no workspace_id (or a request created with no collection_id) is simply never cascaded by
-- anything, which is what leaves the "UNASSIGNED" bucket in the UI possible in the first place.
CREATE TABLE collections (
    id             VARCHAR2(64) PRIMARY KEY,
    name           VARCHAR2(255) NOT NULL,
    parent_id      VARCHAR2(64) NULL REFERENCES collections(id) ON DELETE CASCADE,
    workspace_id   VARCHAR2(64) NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    variables_json CLOB DEFAULT '{}' NOT NULL
);
-- Run this instead of the two CREATE TABLEs above against an EXISTING database that already has
-- a collections table (this script is documented as run-once — re-running CREATE TABLE on a
-- database that already has the table will just fail with "table already exists"). Also
-- migrates every existing collection into a new password-less "Default" workspace and drops the
-- old per-collection password_hash column (the workspace password replaces it):
--   CREATE TABLE workspaces (id VARCHAR2(64) PRIMARY KEY, name VARCHAR2(255) NOT NULL, password_hash VARCHAR2(64) NULL);
--   INSERT INTO workspaces (id, name) VALUES ('default', 'Default');
--   ALTER TABLE collections ADD workspace_id VARCHAR2(64) NULL REFERENCES workspaces(id) ON DELETE CASCADE;
--   UPDATE collections SET workspace_id = 'default';
--   ALTER TABLE collections DROP COLUMN password_hash;

CREATE TABLE requests (
    id                   VARCHAR2(64) PRIMARY KEY,
    collection_id        VARCHAR2(64) NULL REFERENCES collections(id) ON DELETE CASCADE,
    name                 VARCHAR2(255) NOT NULL,
    description          VARCHAR2(2000),
    pre_request_json     CLOB DEFAULT '[]' NOT NULL,
    request_json         CLOB DEFAULT '{}' NOT NULL,
    post_response_json   CLOB DEFAULT '[]' NOT NULL,
    input_data_sets_json CLOB DEFAULT '[]' NOT NULL
);

CREATE TABLE run_logs (
    id          VARCHAR2(64) PRIMARY KEY,
    request_id  VARCHAR2(64) NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    run_id      VARCHAR2(64) NOT NULL,
    status      VARCHAR2(32) NOT NULL,
    result_json CLOB NOT NULL,
    created_at  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX idx_run_logs_request ON run_logs(request_id, created_at);

-- Scoped to a workspace (not a single flat table anymore) — see globals-api.xml and
-- execution-engine.xml's run-request, which resolves the running request's own workspace (via
-- its collection) and only merges THAT workspace's globals in, lowest priority, ahead of
-- collection variables. A request whose collection has no workspace (see the "UNASSIGNED"
-- bucket in the UI) gets no global vars at all — "workspace_id = :wsId" never matches a NULL
-- request-side workspace, which is the desired behavior, not a bug. ON DELETE CASCADE — deleting
-- a workspace takes its global vars with it, same as everything else under it.
CREATE TABLE global_vars (
    workspace_id VARCHAR2(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         VARCHAR2(255) NOT NULL,
    value        CLOB,
    PRIMARY KEY (workspace_id, name)
);
-- Run this instead of the CREATE TABLE above against an EXISTING database that already has a
-- global_vars table (name-only PK, no workspace_id) — migrates every existing global variable
-- into the same "default" workspace the collections migration above creates (run that one
-- first if you haven't already):
--   ALTER TABLE global_vars ADD workspace_id VARCHAR2(64) NULL REFERENCES workspaces(id) ON DELETE CASCADE;
--   UPDATE global_vars SET workspace_id = 'default';
--   ALTER TABLE global_vars MODIFY workspace_id NOT NULL;
--   ALTER TABLE global_vars DROP PRIMARY KEY;
--   ALTER TABLE global_vars ADD PRIMARY KEY (workspace_id, name);

CREATE TABLE connections (
    id          VARCHAR2(64) PRIMARY KEY,
    name        VARCHAR2(255) NOT NULL,
    type        VARCHAR2(64) NOT NULL,
    config_json CLOB DEFAULT '{}' NOT NULL
);

CREATE TABLE run_all_reports (
    collection_id VARCHAR2(64) PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
    report_json   CLOB NOT NULL,
    run_at        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- Run this against an EXISTING database that already has these tables (constraint names below
-- are auto-generated by Oracle and vary per database, so this looks each one up by its table+
-- column instead of requiring you to know the name) — adds ON DELETE CASCADE to every FK above
-- that didn't already have it, so a single DELETE on workspaces/collections/requests now
-- cascades all the way down instead of the app having to manually detach/delete children first:
--   BEGIN
--       FOR c IN (
--           SELECT uc.constraint_name, uc.table_name
--           FROM user_constraints uc
--           JOIN user_cons_columns ucc ON ucc.constraint_name = uc.constraint_name AND ucc.table_name = uc.table_name
--           WHERE uc.constraint_type = 'R'
--             AND ((uc.table_name = 'COLLECTIONS' AND ucc.column_name IN ('PARENT_ID', 'WORKSPACE_ID'))
--               OR (uc.table_name = 'REQUESTS' AND ucc.column_name = 'COLLECTION_ID')
--               OR (uc.table_name = 'RUN_LOGS' AND ucc.column_name = 'REQUEST_ID')
--               OR (uc.table_name = 'GLOBAL_VARS' AND ucc.column_name = 'WORKSPACE_ID')
--               OR (uc.table_name = 'RUN_ALL_REPORTS' AND ucc.column_name = 'COLLECTION_ID'))
--       ) LOOP
--           EXECUTE IMMEDIATE 'ALTER TABLE ' || c.table_name || ' DROP CONSTRAINT ' || c.constraint_name;
--       END LOOP;
--   END;
--   /
--   ALTER TABLE collections ADD CONSTRAINT fk_collections_parent FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE CASCADE;
--   ALTER TABLE collections ADD CONSTRAINT fk_collections_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
--   ALTER TABLE requests ADD CONSTRAINT fk_requests_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
--   ALTER TABLE run_logs ADD CONSTRAINT fk_run_logs_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
--   ALTER TABLE global_vars ADD CONSTRAINT fk_global_vars_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
--   ALTER TABLE run_all_reports ADD CONSTRAINT fk_run_all_reports_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
