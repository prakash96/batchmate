package com.batchmate.workflow.plugin.ftp;

import org.apache.camel.Exchange;
import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPSClient;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class FtpHelper {

    public void read(Exchange exchange) throws Exception {
        String host         = prop(exchange, "_op_host", "localhost");
        int    port         = Integer.parseInt(prop(exchange, "_op_port", "21"));
        String user         = prop(exchange, "_op_user", "");
        String pass         = prop(exchange, "_op_pass", "");
        String path         = prop(exchange, "_op_path", "");
        String filter       = prop(exchange, "_op_filter", "");
        String security     = prop(exchange, "_op_security", "none");
        String resultVar    = prop(exchange, "_op_var", "");
        boolean deleteAfter = "true".equals(prop(exchange, "_op_deleteAfter", "false"));
        String moveTo       = prop(exchange, "_op_moveTo", "");

        FTPClient client = buildClient(security);
        client.connect(host, port);
        if (!user.isEmpty()) client.login(user, pass);
        client.enterLocalPassiveMode();
        client.setFileType(FTP.BINARY_FILE_TYPE);
        try {
            String targetPath = path;
            if (!filter.isEmpty()) {
                FTPFile[] entries = client.listFiles(path);
                targetPath = null;
                if (entries != null) {
                    for (FTPFile entry : entries) {
                        if (entry == null || entry.isDirectory()) continue;
                        String name = entry.getName();
                        if (matchGlob(name, filter)) {
                            targetPath = (path.endsWith("/") ? path : path + "/") + name;
                            break;
                        }
                    }
                }
                if (targetPath == null) {
                    if (!resultVar.isEmpty()) exchange.setProperty(resultVar, null);
                    else exchange.getMessage().setBody(null);
                    return;
                }
            }
            String fileName = targetPath.contains("/")
                    ? targetPath.substring(targetPath.lastIndexOf('/') + 1)
                    : targetPath;
            exchange.getMessage().setHeader("fileName", fileName);
            exchange.getMessage().setHeader("filePath", targetPath);

            File tempFile = File.createTempFile("ftpread-", ".tmp");
            try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                boolean ok = client.retrieveFile(targetPath, fos);
                if (!ok) {
                    tempFile.delete();
                    throw new RuntimeException("FTP retrieve failed for: " + targetPath);
                }
            }
            if (!moveTo.isEmpty()) {
                int lastSlash = moveTo.lastIndexOf('/');
                if (lastSlash > 0) mkdirs(client, moveTo.substring(0, lastSlash));
                client.rename(targetPath, moveTo);
            } else if (deleteAfter) {
                client.deleteFile(targetPath);
            }
            InputStream stream = new FilterInputStream(new FileInputStream(tempFile)) {
                @Override
                public void close() throws IOException {
                    super.close();
                    tempFile.delete();
                }
            };
            if (!resultVar.isEmpty()) exchange.setProperty(resultVar, stream);
            else exchange.getMessage().setBody(stream);
        } finally {
            try { client.logout(); } catch (Exception ignored) {}
            client.disconnect();
        }
    }

    public void write(Exchange exchange) throws Exception {
        String host        = prop(exchange, "_op_host", "localhost");
        int    port        = Integer.parseInt(prop(exchange, "_op_port", "21"));
        String user        = prop(exchange, "_op_user", "");
        String pass        = prop(exchange, "_op_pass", "");
        String security    = prop(exchange, "_op_security", "none");
        String dir         = prop(exchange, "_op_dir", "/");
        String fileName    = prop(exchange, "_op_filename", "output.txt");
        boolean autoCreate = "true".equals(prop(exchange, "_op_autoCreate", "true"));
        String tempSuffix  = prop(exchange, "_op_tempSuffix", "");

        InputStream body = exchange.getMessage().getBody(InputStream.class);
        if (body == null) {
            String s = exchange.getMessage().getBody(String.class);
            byte[] bytes = s != null ? s.getBytes(StandardCharsets.UTF_8) : new byte[0];
            body = new ByteArrayInputStream(bytes);
        }

        FTPClient client = buildClient(security);
        client.connect(host, port);
        if (!user.isEmpty()) client.login(user, pass);
        client.enterLocalPassiveMode();
        client.setFileType(FTP.BINARY_FILE_TYPE);
        try {
            if (autoCreate) mkdirs(client, dir);
            String remotePath = (dir.endsWith("/") ? dir : dir + "/") + fileName;
            if (!tempSuffix.isEmpty()) {
                String tempPath = remotePath + tempSuffix;
                boolean ok = client.storeFile(tempPath, body);
                if (!ok) throw new RuntimeException("FTP store failed for: " + tempPath);
                client.rename(tempPath, remotePath);
            } else {
                boolean ok = client.storeFile(remotePath, body);
                if (!ok) throw new RuntimeException("FTP store failed for: " + remotePath);
            }
        } finally {
            try { client.logout(); } catch (Exception ignored) {}
            client.disconnect();
        }
    }

    private void mkdirs(FTPClient client, String dir) throws Exception {
        String[] parts = dir.split("/");
        StringBuilder current = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            current.append("/").append(part);
            client.makeDirectory(current.toString());
        }
    }

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
