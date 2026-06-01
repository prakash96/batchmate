package com.batchmate.workflow.plugin.ftp;

import org.apache.camel.Exchange;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPSClient;

import java.util.ArrayList;
import java.util.List;

public class FtpHelper {

    public void exists(Exchange exchange) throws Exception {
        String host       = prop(exchange, "_op_host", "localhost");
        int    port       = Integer.parseInt(prop(exchange, "_op_port", "21"));
        String user       = prop(exchange, "_op_user", "");
        String pass       = prop(exchange, "_op_pass", "");
        String path       = prop(exchange, "_op_path", "/");
        String security   = prop(exchange, "_op_security", "none");
        String resultVar  = prop(exchange, "_op_var", "");
        String onNotFound = prop(exchange, "_op_onNotFound", "continue");

        FTPClient client = buildClient(security);
        client.connect(host, port);
        if (!user.isEmpty()) client.login(user, pass);
        client.enterLocalPassiveMode();
        FTPFile[] files = client.listFiles(path);
        boolean found = files != null && files.length > 0;
        client.logout();
        client.disconnect();

        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, found);
        if (!found && "stop".equals(onNotFound)) {
            throw new RuntimeException("FTP file not found: " + path);
        }
    }

    public void list(Exchange exchange) throws Exception {
        String host      = prop(exchange, "_op_host", "localhost");
        int    port      = Integer.parseInt(prop(exchange, "_op_port", "21"));
        String user      = prop(exchange, "_op_user", "");
        String pass      = prop(exchange, "_op_pass", "");
        String path      = prop(exchange, "_op_path", "/");
        String filter    = prop(exchange, "_op_filter", "");
        boolean recursive = "true".equals(prop(exchange, "_op_recursive", "false"));
        String security   = prop(exchange, "_op_security", "none");
        String resultVar  = prop(exchange, "_op_var", "");

        FTPClient client = buildClient(security);
        client.connect(host, port);
        if (!user.isEmpty()) client.login(user, pass);
        client.enterLocalPassiveMode();
        List<String> files = new ArrayList<>();
        collectFiles(client, path, filter, recursive, files);
        client.logout();
        client.disconnect();

        java.util.List<com.batchmate.workflow.camel.api.FileEntry> arrayNode = new java.util.ArrayList<>();
        for (String filePath : files) {
            String fileName = filePath.contains("/")
                ? filePath.substring(filePath.lastIndexOf('/') + 1)
                : filePath;
            arrayNode.add(new com.batchmate.workflow.camel.api.FileEntry(filePath, fileName));
        }
        if (!resultVar.isEmpty()) {
            exchange.setProperty(resultVar, arrayNode);
        } else {
            exchange.getMessage().setBody(arrayNode);
        }
    }

    private void collectFiles(FTPClient client, String dir, String filter, boolean recursive, List<String> result) throws Exception {
        FTPFile[] entries = client.listFiles(dir);
        if (entries == null) return;
        for (FTPFile entry : entries) {
            if (entry == null) continue;
            String name = entry.getName();
            if (".".equals(name) || "..".equals(name)) continue;
            String fullPath = dir.endsWith("/") ? dir + name : dir + "/" + name;
            if (entry.isDirectory()) {
                if (recursive) collectFiles(client, fullPath, filter, true, result);
            } else {
                if (filter.isEmpty() || matchGlob(name, filter)) result.add(fullPath);
            }
        }
    }

    private static boolean matchGlob(String name, String glob) {
        return name.matches(glob.replace(".", "\\.").replace("*", ".*").replace("?", "."));
    }

    private static FTPClient buildClient(String security) {
        if ("explicit".equals(security)) return new FTPSClient(false);
        if ("implicit".equals(security)) return new FTPSClient(true);
        return new FTPClient();
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
