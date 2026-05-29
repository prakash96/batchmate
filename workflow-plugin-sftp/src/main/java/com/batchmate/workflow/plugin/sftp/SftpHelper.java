package com.batchmate.workflow.plugin.sftp;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpException;
import org.apache.camel.Exchange;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Vector;

public class SftpHelper {

    public void exists(Exchange exchange) throws Exception {
        String host      = prop(exchange, "_op_host", "localhost");
        int    port      = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user      = prop(exchange, "_op_user", "");
        String pass      = prop(exchange, "_op_pass", "");
        String path      = prop(exchange, "_op_path", "/");
        String resultVar = prop(exchange, "_op_var", "");

        JSch jsch = new JSch();
        Session session = jsch.getSession(user, host, port);
        if (!pass.isEmpty()) session.setPassword(pass);
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect(10000);
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

        JSch jsch = new JSch();
        Session session = jsch.getSession(user, host, port);
        if (!pass.isEmpty()) session.setPassword(pass);
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect(10000);
        ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
        sftp.connect();
        List<String> files = new ArrayList<>();
        try {
            collectFiles(sftp, path, filter, recursive, files);
        } finally {
            sftp.disconnect();
            session.disconnect();
        }
        List<Map<String, String>> arrayNode = new ArrayList<>();
        for (String filePath : files) {
            String fileName = filePath.contains("/")
                ? filePath.substring(filePath.lastIndexOf('/') + 1)
                : filePath;
            Map<String, String> item = new LinkedHashMap<>();
            item.put("filePath", filePath);
            item.put("fileName", fileName);
            arrayNode.add(item);
        }
        if (!resultVar.isEmpty()) {
            exchange.setProperty(resultVar, arrayNode);
        } else {
            exchange.getMessage().setBody(arrayNode);
        }
    }

    public void delete(Exchange exchange) throws Exception {
        String host           = prop(exchange, "_op_host", "localhost");
        int    port           = Integer.parseInt(prop(exchange, "_op_port", "22"));
        String user           = prop(exchange, "_op_user", "");
        String pass           = prop(exchange, "_op_pass", "");
        String path           = prop(exchange, "_op_path", "");
        boolean ignoreNotFound = "true".equals(prop(exchange, "_op_ignoreNotFound", "false"));

        JSch jsch = new JSch();
        Session session = jsch.getSession(user, host, port);
        if (!pass.isEmpty()) session.setPassword(pass);
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect(10000);
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

        JSch jsch = new JSch();
        Session session = jsch.getSession(user, host, port);
        if (!pass.isEmpty()) session.setPassword(pass);
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect(10000);
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
