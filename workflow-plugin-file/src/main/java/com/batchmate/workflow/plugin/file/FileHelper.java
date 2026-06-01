package com.batchmate.workflow.plugin.file;

import com.batchmate.workflow.camel.api.FileEntry;
import org.apache.camel.Exchange;

import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public class FileHelper {

    /**
     * Normalises the _fr_dir / _fr_file exchange properties before pollEnrich.
     * If _fr_file resolves to an absolute path (e.g. ${body.filePath} = C:\files\readme.txt)
     * it is split so _fr_dir = C:/files and _fr_file = readme.txt, giving a valid
     * file:<dir>?fileName=<name> URI for the Camel file component.
     */
    public void normalizeReadPath(Exchange exchange) {
        String dir  = prop(exchange, "_fr_dir",  ".");
        String file = prop(exchange, "_fr_file", "");

        if (!file.isEmpty()) {
            Path fp = Paths.get(file);
            if (fp.isAbsolute()) {
                Path parent = fp.getParent();
                exchange.setProperty("_fr_dir",  parent != null
                    ? parent.toString().replace('\\', '/') : ".");
                exchange.setProperty("_fr_file", fp.getFileName().toString());
                return;
            }
        }
        // If no separate file was given, check whether dir is itself a file path
        if (file.isEmpty() && !dir.isEmpty() && !dir.equals(".")) {
            Path dp = Paths.get(dir);
            if (Files.isRegularFile(dp)) {
                Path parent = dp.getParent();
                exchange.setProperty("_fr_dir",  parent != null
                    ? parent.toString().replace('\\', '/') : ".");
                exchange.setProperty("_fr_file", dp.getFileName().toString());
            }
        }
    }

    public void read(Exchange exchange) throws Exception {
        String dir       = prop(exchange, "_op_dir",  ".");
        String fileName  = prop(exchange, "_op_file", "");
        String resultVar = prop(exchange, "_op_var",  "");

        Path path;
        if (fileName.isEmpty()) {
            // dir holds the full path
            path = Paths.get(dir);
        } else {
            Path fp = Paths.get(fileName);
            // If fileName resolved to an absolute path use it directly
            path = fp.isAbsolute() ? fp : Paths.get(dir).resolve(fileName);
        }

        if (!Files.exists(path)) throw new RuntimeException("File not found: " + path);

        String content = Files.readString(path);
        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, content);
        exchange.getMessage().setBody(content);
    }

    public void list(Exchange exchange) throws Exception {
        String  dirPath   = prop(exchange, "_op_dir",       ".");
        String  filter    = prop(exchange, "_op_filter",    "");
        boolean recursive = "true".equals(prop(exchange, "_op_recursive", "false"));
        String  resultVar = prop(exchange, "_op_var",       "");

        Path dir = Paths.get(dirPath);
        List<FileEntry> entries = new ArrayList<>();

        try (Stream<Path> stream = recursive ? Files.walk(dir) : Files.list(dir)) {
            stream.filter(Files::isRegularFile)
                  .filter(p -> filter.isEmpty() || matchGlob(p.getFileName().toString(), filter))
                  .forEach(p -> entries.add(
                      new FileEntry(p.toAbsolutePath().toString(), p.getFileName().toString())));
        }

        if (!resultVar.isEmpty()) {
            exchange.setProperty(resultVar, entries);
        } else {
            exchange.getMessage().setBody(entries);
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
