package com.batchmate.workflow.plugin.sftp;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;

import java.util.*;

public class SftpPlugin implements NodeConverterPlugin {

    private final SftpHelper sftpHelper = new SftpHelper();

    @Override
    public String pluginId() { return "sftp"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("sftpread",   this::convertSftpRead);
        m.put("sftpwrite",  this::convertSftpWrite);
        m.put("sftpdelete", this::convertSftpDelete);
        m.put("sftpmove",   this::convertSftpMove);
        m.put("sftpexists", this::convertSftpExists);
        m.put("sftplist",   this::convertSftpList);
        return m;
    }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("sftpHelper", sftpHelper);
    }

    @Override
    public Map<String, ConnectionTester> connectionTesters() {
        return Collections.singletonMap("sftp", config -> {
            String host = config.path("host").asText("localhost");
            int    port = config.path("port").asInt(22);
            String user = config.path("username").asText("");
            String pass = config.path("password").asText("");
            try {
                JSch jsch = new JSch();
                Session session = jsch.getSession(user, host, port);
                if (!pass.isEmpty()) session.setPassword(pass);
                session.setConfig("StrictHostKeyChecking", "no");
                session.connect(10_000);
                session.disconnect();
                return new TestResult(true, "Connected to " + host + ":" + port);
            } catch (Exception e) {
                return new TestResult(false, e.getMessage());
            }
        });
    }

    // ── Read (pollEnrich via Camel SFTP consumer) ─────────────────────────────

    private List<Map<String, Object>> convertSftpRead(JsonNode data) {
        String dir          = ConversionUtils.uiToSimple(data.path("remoteDirectory").asText("/").trim());
        String pattern      = data.path("filePattern").asText("").trim();
        String resultVar    = data.path("resultVar").asText("").trim();
        boolean deleteAfter = data.path("deleteAfterDownload").asBoolean(false);
        String moveTo       = data.path("moveToPath").asText("").trim();
        String privKey      = data.path("privateKeyFile").asText("").trim();
        String privKeyPass  = data.path("privateKeyPassphrase").asText("").trim();

        String uri = ConversionUtils.sftpUri("sftp", data, dir);
        String sep = uri.contains("?") ? "&" : "?";
        if (!pattern.isEmpty()) { uri += sep + "fileName=" + ConversionUtils.uiToSimple(pattern); sep = "&"; }
        if (!privKey.isEmpty()) {
            uri += sep + "privateKeyFile=" + privKey; sep = "&";
            if (!privKeyPass.isEmpty()) uri += "&privateKeyFilePassphrase=" + privKeyPass;
        }
        if (!moveTo.isEmpty()) {
            uri += sep + "move=" + moveTo;
        } else if (deleteAfter) {
            uri += sep + "delete=true";
        } else {
            uri += sep + "noop=true";
        }
        uri += "&idempotent=false&disconnect=true";
        String host = data.path("host").asText("localhost");
        int    port = data.path("port").asInt(22);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftpread: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftpread: Reading " + dir + (pattern.isEmpty() ? "" : "/" + pattern)));
        steps.addAll(ConversionUtils.pollEnrich(uri, resultVar));
        steps.add(ConversionUtils.stripCamelHeaders());
        return steps;
    }

    // ── Write (Camel SFTP producer) ───────────────────────────────────────────

    private List<Map<String, Object>> convertSftpWrite(JsonNode data) {
        String dir         = ConversionUtils.uiToSimple(data.path("remoteDirectory").asText("/").trim());
        String fileName    = ConversionUtils.uiToSimple(data.path("fileName").asText("output.txt").trim());
        boolean overwrite  = data.path("overwriteExisting").asBoolean(false);
        boolean autoCreate = data.path("autoCreateFolders").asBoolean(true);
        String tempSuffix  = data.path("tempFileSuffix").asText("").trim();
        String privKey     = data.path("privateKeyFile").asText("").trim();
        String privKeyPass = data.path("privateKeyPassphrase").asText("").trim();

        String uri = ConversionUtils.sftpUri("sftp", data, dir);
        String sep = uri.contains("?") ? "&" : "?";
        uri += sep + "fileName=" + fileName; sep = "&";
        if (autoCreate)            uri += "&autoCreate=true";
        if (overwrite)             uri += "&fileExist=Override";
        if (!tempSuffix.isEmpty()) uri += "&tempFileName=" + tempSuffix;
        if (!privKey.isEmpty()) {
            uri += "&privateKeyFile=" + privKey;
            if (!privKeyPass.isEmpty()) uri += "&privateKeyFilePassphrase=" + privKeyPass;
        }
        uri += "&disconnect=true";

        String host = data.path("host").asText("localhost");
        int    port = data.path("port").asInt(22);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftpwrite: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftpwrite: Writing " + dir + "/" + fileName));
        steps.add(uri.contains("${") ? ConversionUtils.toDStep(uri) : ConversionUtils.toStep(uri, null));
        return steps;
    }

    // ── Delete (via SftpHelper bean) ──────────────────────────────────────────

    private List<Map<String, Object>> convertSftpDelete(JsonNode data) {
        String host            = data.path("host").asText("localhost");
        String port            = String.valueOf(data.path("port").asInt(22));
        String user            = data.path("username").asText("").trim();
        String pass            = data.path("password").asText("").trim();
        String path            = data.path("remoteFilePath").asText("").trim();
        boolean ignoreNotFound = data.path("ignoreNotFound").asBoolean(false);

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftpdelete: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftpdelete: Deleting " + path));
        steps.add(ConversionUtils.setVarExpr("_op_host",           Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port",           Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_user",           Map.of("constant", user)));
        steps.add(ConversionUtils.setVarExpr("_op_pass",           Map.of("constant", pass)));
        steps.add(ConversionUtils.setVarExpr("_op_path",           ConversionUtils.simpleOrConstant(path)));
        steps.add(ConversionUtils.setVarExpr("_op_ignoreNotFound", Map.of("constant", String.valueOf(ignoreNotFound))));
        steps.add(beanStep("sftpHelper", "delete"));
        return steps;
    }

    // ── Move / Rename (via SftpHelper bean) ───────────────────────────────────

    private List<Map<String, Object>> convertSftpMove(JsonNode data) {
        String host = data.path("host").asText("localhost");
        String port = String.valueOf(data.path("port").asInt(22));
        String user = data.path("username").asText("").trim();
        String pass = data.path("password").asText("").trim();
        String src  = data.path("sourcePath").asText("").trim();
        String dest = data.path("destinationPath").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftpmove: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftpmove: Moving " + src + " -> " + dest));
        steps.add(ConversionUtils.setVarExpr("_op_host", Map.of("constant", host)));
        steps.add(ConversionUtils.setVarExpr("_op_port", Map.of("constant", port)));
        steps.add(ConversionUtils.setVarExpr("_op_user", Map.of("constant", user)));
        steps.add(ConversionUtils.setVarExpr("_op_pass", Map.of("constant", pass)));
        steps.add(ConversionUtils.setVarExpr("_op_src",  ConversionUtils.simpleOrConstant(src)));
        steps.add(ConversionUtils.setVarExpr("_op_dest", ConversionUtils.simpleOrConstant(dest)));
        steps.add(beanStep("sftpHelper", "move"));
        return steps;
    }

    // ── Exists (via SftpHelper bean) ──────────────────────────────────────────

    private List<Map<String, Object>> convertSftpExists(JsonNode data) {
        String host       = data.path("host").asText("localhost");
        int    port       = data.path("port").asInt(22);
        String remotePath = data.path("remotePath").asText("/").trim();
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftpexists: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftpexists: Checking " + remotePath));
        steps.addAll(sftpOpSteps(data, "exists"));
        return steps;
    }

    // ── List (via SftpHelper bean) ────────────────────────────────────────────

    private List<Map<String, Object>> convertSftpList(JsonNode data) {
        String host       = data.path("host").asText("localhost");
        int    port       = data.path("port").asInt(22);
        String remotePath = data.path("remotePath").asText("/").trim();
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("sftplist: Connecting to " + host + ":" + port));
        steps.add(ConversionUtils.logMsg("sftplist: Listing " + remotePath));
        steps.addAll(sftpOpSteps(data, "list"));
        return steps;
    }

    private List<Map<String, Object>> sftpOpSteps(JsonNode data, String method) {
        String host       = data.path("host").asText("localhost");
        String port       = String.valueOf(data.path("port").asInt(22));
        String user       = data.path("username").asText("").trim();
        String pass       = data.path("password").asText("").trim();
        String remotePath = data.path("remotePath").asText("/").trim();
        String filter     = data.path("filter").asText("").trim();
        String recursive  = data.path("recursive").asBoolean(false) ? "true" : "false";
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
        steps.add(ConversionUtils.setVarExpr("_op_var",        Map.of("constant", resultVar)));
        steps.add(ConversionUtils.setVarExpr("_op_onNotFound", Map.of("constant", onNotFound)));
        steps.add(beanStep("sftpHelper", method));
        return steps;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Map<String, Object> beanStep(String ref, String method) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ref", ref);
        body.put("method", method);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bean", body);
        return step;
    }
}
