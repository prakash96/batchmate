package com.batchmate.workflow.plugin.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.nio.charset.StandardCharsets;
import java.util.*;

public class SecurityPlugin implements NodeConverterPlugin {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final PgpHelper pgpHelper = new PgpHelper();

    @Override
    public String pluginId() { return "security"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("pgpencrypt", data -> { try { return convertPgpEncrypt(data); } catch (Exception e) { throw new RuntimeException(e); } });
        m.put("pgpdecrypt", data -> { try { return convertPgpDecrypt(data); } catch (Exception e) { throw new RuntimeException(e); } });
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Map.of("pgpHelper", pgpHelper);
    }

    // ── Converters ────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertPgpEncrypt(JsonNode data) throws Exception {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("keySource",    data.path("recipientKeySource").asText("inline"));
        cfg.put("keyFile",      data.path("recipientKeyFile").asText(""));
        cfg.put("keyInline",    data.path("recipientKeyInline").asText(""));
        cfg.put("keyVar",       data.path("recipientKeyVariable").asText(""));
        cfg.put("userId",       data.path("recipientUserId").asText(""));
        cfg.put("armor",        data.path("armorOutput").asBoolean(true));
        cfg.put("cipher",       data.path("cipherAlgorithm").asText("AES256"));
        cfg.put("compress",     data.path("compressionAlgorithm").asText("ZIP"));
        cfg.put("sign",         data.path("signMessage").asBoolean(false));
        cfg.put("sigKeySource", data.path("signingKeySource").asText("inline"));
        cfg.put("sigKeyFile",   data.path("signingKeyFile").asText(""));
        cfg.put("sigKeyInline", data.path("signingKeyInline").asText(""));
        cfg.put("sigPass",      data.path("signingPassphrase").asText(""));
        cfg.put("contentSource",data.path("contentSource").asText("body"));
        cfg.put("contentVar",   data.path("contentVariable").asText(""));
        cfg.put("resultVar",    data.path("resultVar").asText(""));
        cfg.put("setAsBody",    data.path("setAsBody").asBoolean(true));
        return buildSteps(cfg, "encrypt");
    }

    private List<Map<String, Object>> convertPgpDecrypt(JsonNode data) throws Exception {
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("keySource",    data.path("privateKeySource").asText("inline"));
        cfg.put("keyFile",      data.path("privateKeyFile").asText(""));
        cfg.put("keyInline",    data.path("privateKeyInline").asText(""));
        cfg.put("keyVar",       data.path("privateKeyVariable").asText(""));
        cfg.put("passphrase",   data.path("passphrase").asText(""));
        cfg.put("contentSource",data.path("contentSource").asText("body"));
        cfg.put("contentVar",   data.path("contentVariable").asText(""));
        cfg.put("resultVar",    data.path("resultVar").asText(""));
        cfg.put("setAsBody",    data.path("setAsBody").asBoolean(true));
        return buildSteps(cfg, "decrypt");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<Map<String, Object>> buildSteps(Map<String, Object> cfg, String method) throws Exception {
        String json      = MAPPER.writeValueAsString(cfg);
        String base64Cfg = Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));

        Map<String, Object> setPropBody = new LinkedHashMap<>();
        setPropBody.put("name", "_pgp_config");
        setPropBody.put("expression", Map.of("constant", base64Cfg));
        Map<String, Object> setPropStep = new LinkedHashMap<>();
        setPropStep.put("setProperty", setPropBody);

        Map<String, Object> beanBody = new LinkedHashMap<>();
        beanBody.put("ref", "pgpHelper");
        beanBody.put("method", method);
        Map<String, Object> beanStep = new LinkedHashMap<>();
        beanStep.put("bean", beanBody);

        return List.of(setPropStep, beanStep);
    }
}
