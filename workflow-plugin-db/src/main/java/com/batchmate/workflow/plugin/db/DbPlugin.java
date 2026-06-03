package com.batchmate.workflow.plugin.db;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConnectionTester;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;
import com.batchmate.workflow.camel.api.TestResult;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.*;

public class DbPlugin implements NodeConverterPlugin {

    @Override
    public String pluginId() { return "db"; }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("dbexecute", this::convertDbExecute);
        return m;
    }

    @Override
    public Map<String, ConnectionTester> connectionTesters() {
        Map<String, ConnectionTester> m = new LinkedHashMap<>();
        m.put("postgresql", c -> testJdbc(postgresUrl(c),   "org.postgresql.Driver",                               c.path("username").asText(null), c.path("password").asText(null)));
        m.put("mysql",      c -> testJdbc(mysqlUrl(c),      "com.mysql.cj.jdbc.Driver",                            c.path("username").asText(null), c.path("password").asText(null)));
        m.put("oracle",     c -> testJdbc(oracleUrl(c),     "oracle.jdbc.OracleDriver",                            c.path("username").asText(null), c.path("password").asText(null)));
        m.put("sqlserver",  c -> testJdbc(sqlserverUrl(c),  "com.microsoft.sqlserver.jdbc.SQLServerDriver",        c.path("username").asText(null), c.path("password").asText(null)));
        m.put("db",         c -> testJdbc(c.path("jdbcUrl").asText(), c.path("driverClass").asText(null),          c.path("username").asText(null), c.path("password").asText(null)));
        return m;
    }

    // ── Converter ─────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertDbExecute(JsonNode data) {
        String connectionId = data.path("connectionId").asText("").trim();
        String query        = data.path("query").asText("").trim();
        String resultVar    = data.path("resultVar").asText("").trim();

        String beanName = !connectionId.isEmpty()
            ? "ds-" + connectionId
            : "ds-inline-" + Math.abs(data.path("jdbcUrl").asText("").hashCode());

        String connLabel = !connectionId.isEmpty() ? connectionId : data.path("jdbcUrl").asText("db");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("dbexecute: Connecting to " + connLabel));
        steps.add(ConversionUtils.logMsg("dbexecute: Executing query"));
        steps.add(ConversionUtils.setBodyConstant(query));
        steps.add(ConversionUtils.toStep("jdbc:" + beanName + "?resetAutoCommit=false", null));

        if (!resultVar.isEmpty()) {
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("js", "body")));
        }
        return steps;
    }

    // ── Connection test helpers ───────────────────────────────────────────────

    private static TestResult testJdbc(String url, String driverClass, String user, String pass) {
        try {
            if (driverClass != null && !driverClass.isBlank()) Class.forName(driverClass);
            try (Connection conn = DriverManager.getConnection(url, user, pass)) {
                return new TestResult(true, "Connected successfully");
            }
        } catch (Exception e) {
            return new TestResult(false, e.getMessage());
        }
    }

    private static String postgresUrl(JsonNode c) {
        String host = c.path("host").asText("localhost");
        String port = c.path("port").asText("5432");
        String db   = c.path("database").asText("");
        String ssl  = c.path("ssl").asBoolean(false) ? "?ssl=true&sslmode=require" : "";
        return "jdbc:postgresql://" + host + ":" + port + "/" + db + ssl;
    }

    private static String mysqlUrl(JsonNode c) {
        String host = c.path("host").asText("localhost");
        String port = c.path("port").asText("3306");
        String db   = c.path("database").asText("");
        boolean ssl = c.path("useSSL").asBoolean(false);
        return "jdbc:mysql://" + host + ":" + port + "/" + db
            + "?useSSL=" + ssl + "&allowPublicKeyRetrieval=true&serverTimezone=UTC";
    }

    private static String oracleUrl(JsonNode c) {
        String host    = c.path("host").asText("localhost");
        String port    = c.path("port").asText("1521");
        String connType = c.path("connectionType").asText("service");
        String sid     = c.path("sidOrService").asText("");
        return "sid".equals(connType)
            ? "jdbc:oracle:thin:@" + host + ":" + port + ":" + sid
            : "jdbc:oracle:thin:@//" + host + ":" + port + "/" + sid;
    }

    private static String sqlserverUrl(JsonNode c) {
        String host  = c.path("host").asText("localhost");
        String port  = c.path("port").asText("1433");
        String db    = c.path("database").asText("");
        boolean trust = c.path("trustServerCertificate").asBoolean(false);
        return "jdbc:sqlserver://" + host + ":" + port
            + ";databaseName=" + db + ";trustServerCertificate=" + trust;
    }
}
