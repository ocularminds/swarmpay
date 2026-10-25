package com.swarmpay.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import javax.sql.DataSource;
import java.util.Set;

/** A fixture ledger must never be re-labelled as a sandbox payment ledger. */
public final class RuntimeBinding {
    private RuntimeBinding() {}
    public static void verify(DataSource source,String schema,String mode) {
        if(!Set.of("commerce","payments").contains(schema) || !Set.of("demo","sandbox").contains(mode)) throw new IllegalArgumentException("Invalid runtime binding");
        var db=new JdbcTemplate(source);
        db.update("INSERT INTO "+schema+".runtime_binding(id,mode) VALUES (1,?) ON CONFLICT(id) DO NOTHING",mode);
        String stored=db.queryForObject("SELECT mode FROM "+schema+".runtime_binding WHERE id=1",String.class);
        if(!mode.equals(stored)) throw new IllegalStateException("Database mode differs from SWARM_MODE. Use a separate Compose project/database for sandbox.");
    }
}
