CREATE TABLE runtime_binding (
    id integer PRIMARY KEY CHECK(id=1),
    mode varchar(10) NOT NULL CHECK(mode IN ('demo','sandbox'))
);
