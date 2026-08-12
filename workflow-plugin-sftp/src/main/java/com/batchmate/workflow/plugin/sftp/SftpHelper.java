package com.batchmate.workflow.plugin.sftp;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpException;
import org.apache.camel.Exchange;

import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Vector;

public class SftpHelper {

    private Session createSession(String user, String pass, String host, int port) throws Exception {
        JSch jsch = new JSch();
        Session session = jsch.getSession(user, host, port);
        if (!pass.isEmpty()) session.setPassword(pass);
        session.setConfig("StrictHostKeyChecking", "no");
        session.setConfig("GSSAPIAuthentication", "no");
        session.setConfig("PreferredAuthentications", "publickey,keyboard-interactive,password");
        session.connect(10000);
        return session;
    }

    public void exists(Exchange exchange) throws Exception {
        String host      = prop(exchange, "_op_host", "localhost");
        int    port      = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user      = prop(exchange, "_op_user", "");
        String pass      = prop(exchange, "_op_pass", "");
        String path      = prop(exchange, "_op_path", "/");
        String resultVar = prop(exchange, "_op_var", "");

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        boolean found;
        try {
            sftp.stat(path);
            found = true;
        } catch (SftpException e) {
            found = false;
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, found);
        String onNotFound = prop(exchange, "_op_onNotFound", "continue");
        if (!found && "stop".equals(onNotFound)) {
            throw new RuntimeException("SFTP file not found: " + path);
        }
    }

    public void list(Exchange exchange) throws Exception {
        String host      = prop(exchange, "_op_host", "localhost");
        int    port      = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user      = prop(exchange, "_op_user", "");
        String pass      = prop(exchange, "_op_pass", "");
        String path      = prop(exchange, "_op_path", "/");
        String filter    = prop(exchange, "_op_filter", "");
        boolean recursive = "true".equals(prop(exchange, "_op_recursive", "false"));
        String resultVar  = prop(exchange, "_op_var", "");

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        List<String> files = new ArrayList<>();
        try {
            collectFiles(sftp, path, filter, recursive, files);
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
        List<com.batchmate.workflow.camel.api.FileEntry> arrayNode = new ArrayList<>();
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

    public void read(Exchange exchange) throws Exception {
        String host         = prop(exchange, "_op_host", "localhost");
        int    port         = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user         = prop(exchange, "_op_user", "");
        String pass         = prop(exchange, "_op_pass", "");
        String path         = prop(exchange, "_op_path", "");
        String filter       = prop(exchange, "_op_filter", "");
        String resultVar    = prop(exchange, "_op_var", "");
        boolean deleteAfter = "true".equals(prop(exchange, "_op_deleteAfter", "false"));
        String moveTo       = prop(exchange, "_op_moveTo", "");

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        try {
            String targetPath = path;
            if (!filter.isEmpty()) {
                Vector<ChannelSftp.LsEntry> entries = sftp.ls(path);
                targetPath = null;
                for (ChannelSftp.LsEntry entry : entries) {
                    String name = entry.getFilename();
                    if (!".".equals(name) && !"..".equals(name) && !entry.getAttrs().isDir()
                            && matchGlob(name, filter)) {
                        targetPath = (path.endsWith("/") ? path : path + "/") + name;
                        break;
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

            File tempFile = File.createTempFile("sftpread-", ".tmp");
            sftp.get(targetPath, tempFile.getAbsolutePath());
            if (!moveTo.isEmpty()) {
                int lastSlash = moveTo.lastIndexOf('/');
                if (lastSlash > 0) mkdirs(sftp, moveTo.substring(0, lastSlash));
                sftp.rename(targetPath, moveTo);
            } else if (deleteAfter) {
                sftp.rm(targetPath);
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
            sftp.disconnect();
            session.disconnect();
        }
    }

    public void write(Exchange exchange) throws Exception {
        String host        = prop(exchange, "_op_host", "localhost");
        int    port        = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user        = prop(exchange, "_op_user", "");
        String pass        = prop(exchange, "_op_pass", "");
        String dir         = prop(exchange, "_op_dir", "/");
        String fileName    = prop(exchange, "_op_filename", "output.txt");
        boolean autoCreate = "true".equals(prop(exchange, "_op_autoCreate", "true"));
        String tempSuffix  = prop(exchange, "_op_tempSuffix", "");

        InputStream body = exchange.getMessage().getBody(InputStream.class);
        if (body == null) {
            String s = exchange.getMessage().getBody(String.class);
            byte[] bytes = s != null ? s.getBytes(java.nio.charset.StandardCharsets.UTF_8) : new byte[0];
            body = new java.io.ByteArrayInputStream(bytes);
        }

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        try {
            if (autoCreate) mkdirs(sftp, dir);
            String remotePath = (dir.endsWith("/") ? dir : dir + "/") + fileName;
            if (!tempSuffix.isEmpty()) {
                String tempPath = remotePath + tempSuffix;
                sftp.put(body, tempPath);
                sftp.rename(tempPath, remotePath);
            } else {
                sftp.put(body, remotePath);
            }
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
    }

    private void mkdirs(ChannelSftp sftp, String dir) {
        String[] parts = dir.split("/");
        StringBuilder current = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            current.append("/").append(part);
            try { sftp.mkdir(current.toString()); } catch (SftpException ignored) {}
        }
    }

    public void delete(Exchange exchange) throws Exception {
        String host           = prop(exchange, "_op_host", "localhost");
        int    port           = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user           = prop(exchange, "_op_user", "");
        String pass           = prop(exchange, "_op_pass", "");
        String path           = prop(exchange, "_op_path", "");
        boolean ignoreNotFound = "true".equals(prop(exchange, "_op_ignoreNotFound", "false"));

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        try {
            sftp.rm(path);
        } catch (SftpException e) {
            if (!ignoreNotFound) throw e;
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
    }

    public void move(Exchange exchange) throws Exception {
        String host = prop(exchange, "_op_host", "localhost");
        int    port = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user = prop(exchange, "_op_user", "");
        String pass = prop(exchange, "_op_pass", "");
        String src  = prop(exchange, "_op_src", "");
        String dest = prop(exchange, "_op_dest", "");

        Session session = createSession(user, pass, host, port);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        try {
            sftp.rename(src, dest);
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
    }

    private void collectFiles(ChannelSftp sftp, String dir, String filter, boolean recursive, List<String> result) throws Exception {
        Vector<ChannelSftp.LsEntry> entries = sftp.ls(dir);
        for (ChannelSftp.LsEntry entry : entries) {
            String name = entry.getFilename();
            if (".".equals(name) || "..".equals(name)) continue;
            String fullPath = dir.endsWith("/") ? dir + name : dir + "/" + name;
            if (entry.getAttrs().isDir()) {
                if (recursive) collectFiles(sftp, fullPath, filter, true, result);
            } else {
                if (filter.isEmpty() || matchGlob(name, filter)) result.add(fullPath);
            }
        }
    }

    private static boolean matchGlob(String name, String glob) {
        return name.matches(glob.replace(".", "\\.").replace("*", ".*").replace("?", "."));
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
