package com.batchmate.workflow.camel;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.service.VaultService;
import org.apache.camel.spi.PropertiesSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Camel PropertiesSource that resolves "vault.<id>.<field>" placeholders
 * from vault.json at runtime so secrets never appear in YAML routes.
 *
 * Example: {{vault.vault-123.value}} → actual secret from the saved vault entry
 */
public class VaultPropertiesSource implements PropertiesSource {

    private static final Logger log = LoggerFactory.getLogger(VaultPropertiesSource.class);

    private final VaultService vaultService;

    public VaultPropertiesSource(VaultService vaultService) {
        this.vaultService = vaultService;
    }

    @Override
    public String getName() {
        return "vault";
    }

    @Override
    public String getProperty(String name) {
        if (!name.startsWith("vault.")) return null;
        String remainder = name.substring("vault.".length());
        int dot = remainder.indexOf('.');
        if (dot < 0) return null;
        String vaultId = remainder.substring(0, dot);
        String field   = remainder.substring(dot + 1);
        try {
            return vaultService.list().stream()
                .filter(e -> vaultId.equals(e.path("id").asText()))
                .findFirst()
                .map(e -> {
                    JsonNode val = e.path("config").path(field);
                    return val.isMissingNode() ? null : val.asText(null);
                })
                .orElse(null);
        } catch (Exception e) {
            log.warn("VaultPropertiesSource: failed to resolve vault.{}.{}: {}", vaultId, field, e.getMessage());
            return null;
        }
    }
}
