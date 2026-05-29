package com.batchmate.workflow.camel;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.service.ConnectionService;
import org.apache.camel.spi.PropertiesSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Camel PropertiesSource that resolves "conn.<id>.<field>" placeholders
 * from connections.json at runtime so credentials never appear in YAML routes.
 *
 * Example: {{conn.abc123.password}} → actual password from the saved connection
 */
public class ConnectionPropertiesSource implements PropertiesSource {

    private static final Logger log = LoggerFactory.getLogger(ConnectionPropertiesSource.class);

    private final ConnectionService connectionService;

    public ConnectionPropertiesSource(ConnectionService connectionService) {
        this.connectionService = connectionService;
    }

    @Override
    public String getName() {
        return "connections";
    }

    @Override
    public String getProperty(String name) {
        if (!name.startsWith("conn.")) return null;
        String remainder = name.substring("conn.".length());
        int dot = remainder.indexOf('.');
        if (dot < 0) return null;
        String connId = remainder.substring(0, dot);
        String field  = remainder.substring(dot + 1);
        try {
            return connectionService.list().stream()
                .filter(c -> connId.equals(c.path("id").asText()))
                .findFirst()
                .map(c -> {
                    JsonNode val = c.path("config").path(field);
                    return val.isMissingNode() ? null : val.asText(null);
                })
                .orElse(null);
        } catch (Exception e) {
            log.warn("ConnectionPropertiesSource: failed to resolve conn.{}.{}: {}", connId, field, e.getMessage());
            return null;
        }
    }
}
