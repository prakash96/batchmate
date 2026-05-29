package com.batchmate.workflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.camel.CamelContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@DependsOn("nodeConverterRegistry")  // ensures plugin JARs (with JDBC drivers) are loaded first
public class DataSourceRegistry {

    private static final Logger log = LoggerFactory.getLogger(DataSourceRegistry.class);

    private static final Set<String> DB_TYPES =
        Set.of("db", "postgresql", "mysql", "oracle", "sqlserver");

    private final CamelContext camelContext;
    private final ConnectionService connectionService;
    private final Map<String, HikariDataSource> pool = new ConcurrentHashMap<>();

    public DataSourceRegistry(CamelContext camelContext, ConnectionService connectionService) {
        this.camelContext = camelContext;
        this.connectionService = connectionService;
    }

    @PostConstruct
    public void init() {
        try {
            for (JsonNode conn : connectionService.list()) {
                if (DB_TYPES.contains(conn.path("type").asText())) {
                    refresh(conn);
                }
            }
        } catch (IOException e) {
            log.warn("Could not pre-load database connections: {}", e.getMessage());
        }
    }

    /** Create or replace the DataSource bean for a connection. */
    public void refresh(JsonNode conn) {
        String id   = conn.path("id").asText("").trim();
        String type = conn.path("type").asText();
        if (id.isEmpty() || !DB_TYPES.contains(type)) return;

        String beanName = "ds-" + id;
        remove(id); // close any existing pool first

        try {
            HikariDataSource ds = new HikariDataSource(buildConfig(conn));
            pool.put(id, ds);
            camelContext.getRegistry().bind(beanName, ds);
            log.info("Registered DataSource '{}' (type={})", beanName, type);
        } catch (Exception e) {
            log.error("Failed to create DataSource '{}': {}", beanName, e.getMessage());
        }
    }

    /** Close and unregister the DataSource for a connection. */
    public void remove(String id) {
        HikariDataSource ds = pool.remove(id);
        if (ds != null) {
            try { ds.close(); } catch (Exception ignored) {}
        }
    }

    // ── JDBC URL builder ──────────────────────────────────────────────────────

    private static HikariConfig buildConfig(JsonNode c) {
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("batchmate-ds-" + c.path("id").asText());
        cfg.setMinimumIdle(0);
        cfg.setMaximumPoolSize(5);
        cfg.setConnectionTimeout(30_000);
        cfg.setInitializationFailTimeout(0); // don't connect until first query

        // Connection fields are stored nested under "config" by the frontend
        JsonNode f = c.has("config") ? c.path("config") : c;

        String username = f.path("username").asText(null);
        String password = f.path("password").asText(null);
        if (username != null && !username.isBlank()) cfg.setUsername(username);
        if (password != null && !password.isBlank()) cfg.setPassword(password);

        switch (c.path("type").asText()) {
            case "postgresql": {
                String host = f.path("host").asText("localhost");
                String port = f.path("port").asText("5432");
                String db   = f.path("database").asText("");
                String ssl  = f.path("ssl").asBoolean(false) ? "?ssl=true&sslmode=require" : "";
                cfg.setJdbcUrl("jdbc:postgresql://" + host + ":" + port + "/" + db + ssl);
                break;
            }
            case "mysql": {
                String host = f.path("host").asText("localhost");
                String port = f.path("port").asText("3306");
                String db   = f.path("database").asText("");
                boolean ssl = f.path("useSSL").asBoolean(false);
                cfg.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + db
                    + "?useSSL=" + ssl + "&allowPublicKeyRetrieval=true&serverTimezone=UTC");
                break;
            }
            case "oracle": {
                String host     = f.path("host").asText("localhost");
                String port     = f.path("port").asText("1521");
                String connType = f.path("connectionType").asText("service");
                String sid      = f.path("sidOrService").asText("");
                cfg.setJdbcUrl("sid".equals(connType)
                    ? "jdbc:oracle:thin:@" + host + ":" + port + ":" + sid
                    : "jdbc:oracle:thin:@//" + host + ":" + port + "/" + sid);
                break;
            }
            case "sqlserver": {
                String host  = f.path("host").asText("localhost");
                String port  = f.path("port").asText("1433");
                String db    = f.path("database").asText("");
                boolean trust = f.path("trustServerCertificate").asBoolean(false);
                cfg.setJdbcUrl("jdbc:sqlserver://" + host + ":" + port
                    + ";databaseName=" + db + ";trustServerCertificate=" + trust);
                break;
            }
            default: {
                // Generic db type — raw jdbcUrl field
                cfg.setJdbcUrl(f.path("jdbcUrl").asText());
                String driver = f.path("driverClass").asText(null);
                if (driver != null && !driver.isBlank()) cfg.setDriverClassName(driver);
                break;
            }
        }
        return cfg;
    }
}
