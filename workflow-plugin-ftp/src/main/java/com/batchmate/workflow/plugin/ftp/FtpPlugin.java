package com.batchmate.workflow.plugin.ftp;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPSClient;

import java.util.*;

public class FtpPlugin implements NodeConverterPlugin {

    private final FtpHelper ftpHelper = new FtpHelper();

    @Override
    public String pluginId() { return "ftp"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("ftpread",   this::convertFtpRead);
        m.put("ftpwrite",  this::convertFtpWrite);
        m.put("ftpexists", this::convertFtpExists);
        m.put("ftplist",   this::convertFtpList);
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("ftpHelper", ftpHelper);
    }

    @Override
    public Map<String, ConnectionTester> connectionTesters() {
        return Collections.singletonMap("ftp", config -> {
            String host     = config.path("host").asText("localhost");
            int    port     = config.path("port").asInt(21);
            String user     = config.path("username").asText("");
            String pass     = config.path("password").asText("");
            String security = config.path("securityMode").asText("none");
            try {
                FTPClient client = "none".equals(security) ? new FTPClient()
                    : "implicit".equals(security) ? new FTPSClient("TLS", true)
                    : new FTPSClient("TLS", false);
                client.setConnectTimeout(10_000);
                client.connect(host, port);
                if (!user.isEmpty()) {
                    boolean ok = client.login(user, pass);
                    if (!ok) { client.disconnect(); return new TestResult(false, "Login failed"); }
                }
                client.logout();
                client.disconnect();
                return new TestResult(true, "Connected to " + host + ":" + port);
            } catch (Exception e) {
                return new TestResult(false, e.getMessage());
            }
        });
    }

    // ── Read (pollEnrich via Camel FTP/FTPS consumer) ─────────────────────────

    private List<Map<String, Object>> convertFtpRead(JsonNode data) {
        String dir          = ConversionUtils.uiToSimple(data.path("remoteDirectory").asText("/").trim());
        String pattern      = data.path("filePattern").asText("").trim();
        String security     = data.path("securityMode").asText("none");
        String resultVar    = data.path("resultVar").asText("").trim();
        boolean deleteAfter = data.path("deleteAfterDownload").asBoolean(false);
        String moveTo       = data.path("moveToPath").asText("").trim();

        String scheme = "none".equals(security) ? "ftp" : "ftps";
        String uri = ConversionUtils.ftpUri(scheme, data, dir);
        String sep = uri.contains("?") ? "&" : "?";
        if (!pattern.isEmpty())          { uri += sep + "fileName=" + ConversionUtils.uiToSimple(pattern); sep = "&"; }
        if ("implicit".equals(security)) { uri += sep + "implicit=true";       sep = "&"; }
        if (!moveTo.isEmpty()) {
            uri += sep + "move=" + moveTo;
        } else if (deleteAfter) {
            uri += sep + "delete=true";
        } else {
            uri += sep + "noop=true";
        }
        uri += "&idempotent=false";
        String host = data.path("host").asText("localhost");
        int    port = data.path("port").asInt(21);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("ftpread: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("ftpread: Reading " + dir + (pattern.isEmpty() ? "" : "/" + pattern)));
        steps.addAll(ConversionUtils.pollEnrich(uri, resultVar));
        steps.add(ConversionUtils.stripCamelHeaders());
        return steps;
    }

    // ── Write (Camel FTP/FTPS producer) ──────────────────────────────────────

    private List<Map<String, Object>> convertFtpWrite(JsonNode data) {
        String dir        = ConversionUtils.uiToSimple(data.path("remoteDirectory").asText("/").trim());
        String fileName   = ConversionUtils.uiToSimple(data.path("fileName").asText("output.txt").trim());
        String security   = data.path("securityMode").asText("none");
        boolean overwrite = data.path("overwriteExisting").asBoolean(false);
        boolean autoCreate = data.path("autoCreateFolders").asBoolean(false);
        String tempSuffix = data.path("tempFileSuffix").asText("").trim();

        String scheme = "none".equals(security) ? "ftp" : "ftps";
        String uri = ConversionUtils.ftpUri(scheme, data, dir);
        String sep = uri.contains("?") ? "&" : "?";
        uri += sep + "fileName=" + fileName; sep = "&";
        if ("implicit".equals(security)) uri += "&implicit=true";
        if (autoCreate)            uri += "&autoCreate=true";
        if (overwrite)             uri += "&fileExist=Override";
        if (!tempSuffix.isEmpty()) uri += "&tempFileName=" + tempSuffix;

        String host = data.path("host").asText("localhost");
        int    port = data.path("port").asInt(21);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("ftpwrite: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("ftpwrite: Writing " + dir + "/" + fileName));
        steps.add(uri.contains("${") ? ConversionUtils.toDStep(uri) : ConversionUtils.toStep(uri, null));
        return steps;
    }

    // ── Exists / List (via FtpHelper bean) ───────────────────────────────────

    private List<Map<String, Object>> convertFtpExists(JsonNode data) {
        String host       = data.path("host").asText("localhost");
        int    port       = data.path("port").asInt(21);
        String remotePath = data.path("remotePath").asText("/").trim();
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("ftpexists: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("ftpexists: Checking " + remotePath));
        steps.addAll(ftpOpSteps(data, "exists"));
        return steps;
    }

    private List<Map<String, Object>> convertFtpList(JsonNode data) {
        String host       = data.path("host").asText("localhost");
        int    port       = data.path("port").asInt(21);
        String remotePath = data.path("remotePath").asText("/").trim();
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("ftplist: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("ftplist: Listing " + remotePath));
        steps.addAll(ftpOpSteps(data, "list"));
        return steps;
    }

    private List<Map<String, Object>> ftpOpSteps(JsonNode data, String method) {
        String host       = data.path("host").asText("localhost");
        String port       = String.valueOf(data.path("port").asInt(21));
        String user       = data.path("username").asText("").trim();
        String pass       = data.path("password").asText("").trim();
        String remotePath = data.path("remotePath").asText("/").trim();
        String filter     = data.path("filter").asText("").trim();
        String recursive  = data.path("recursive").asBoolean(false) ? "true" : "false";
        String security   = data.path("securityMode").asText("none");
        String resultVar  = data.path("resultVar").asText("").trim();
        String onNotFound = data.path("onNotFound").asText("continue");

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.setVarExpr("_op_host",       Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port",       Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_user",       Map.of("constant", user)));
        steps.add(ConversionUtils.setVarExpr("_op_pass",       Map.of("constant", pass)));
        steps.add(ConversionUtils.setVarExpr("_op_path",       ConversionUtils.simpleOrConstant(remotePath)));
        steps.add(ConversionUtils.setVarExpr("_op_filter",     Map.of("constant", filter)));
        steps.add(ConversionUtils.setVarExpr("_op_recursive",  Map.of("constant", recursive)));
        steps.add(ConversionUtils.setVarExpr("_op_security",   Map.of("constant", security)));
        steps.add(ConversionUtils.setVarExpr("_op_var",        Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_op_onNotFound", Map.of("constant", onNotFound)));
        Map<String, Object> beanBody = new LinkedHashMap<>();
        beanBody.put("ref", "ftpHelper");
        beanBody.put("method", method);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bean", beanBody);
        steps.add(step);
        return steps;
    }

}
