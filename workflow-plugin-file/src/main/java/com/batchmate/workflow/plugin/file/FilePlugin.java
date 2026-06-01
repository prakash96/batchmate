package com.batchmate.workflow.plugin.file;

import com.fasterxml.jackson.databind.JsonNode;
import com.batchmate.workflow.camel.api.ConversionUtils;
import com.batchmate.workflow.camel.api.NodeConverter;
import com.batchmate.workflow.camel.api.NodeConverterPlugin;

import java.util.*;

public class FilePlugin implements NodeConverterPlugin {

    private final FileHelper fileHelper = new FileHelper();

    @Override
    public String pluginId() { return "file"; }

    @Override
    public Map<String, Object> beans() {
        return Collections.singletonMap("fileHelper", fileHelper);
    }

    @Override
    public Map<String, NodeConverter> converters() {
        Map<String, NodeConverter> m = new LinkedHashMap<>();
        m.put("fileread",   this::convertFileRead);
        m.put("filewrite",  this::convertFileWrite);
        m.put("fileappend", this::convertFileAppend);
        m.put("filemove",   this::convertFileMove);
        m.put("filedelete", this::convertFileDelete);
        m.put("fileexists", this::convertFileExists);
        m.put("filelist",   this::convertFileList);
        m.put("jsonconfig", this::convertJsonConfig);
        return m;
    }

    /**
     * Returns a JS expression that resolves to the path string at runtime.
     * Dynamic paths (${vars.X} etc.) become evaluated JS; static paths become string literals.
     */
    private static String pathExpr(String path) {
        if (path.contains("${")) {
            return "String(" + ConversionUtils.simpleToJs(path) + ")";
        }
        return "'" + ConversionUtils.escapeJs(path.replace('\\', '/')) + "'";
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertFileRead(JsonNode data) {
        // New fields: directory + fileName (mirrors SFTP/FTP read).
        // Falls back to legacy filePath for existing saved workflows.
        String legacyPath = data.path("filePath").asText("").trim();
        String directory  = data.path("directory").asText("").trim();
        String fileName   = data.path("fileName").asText("").trim();
        String resultVar  = data.path("resultVar").asText("").trim();

        // Build effective directory and filename
        String dir;
        String file;
        if (!legacyPath.isEmpty()) {
            String[] parts = ConversionUtils.splitPath(legacyPath);
            dir  = parts[0];
            file = parts[1];
        } else {
            dir  = directory.isEmpty() ? "." : directory.replace('\\', '/');
            file = fileName.isEmpty() ? "" : fileName;
        }

        boolean dynamic = dir.contains("${") || file.contains("${");
        String logPath = (dir.equals(".") && !file.isEmpty()) ? file
                       : dir + (file.isEmpty() ? "" : "/" + file);

        // Build the Camel file: URI — uiToSimple converts ${vars.x} → ${exchangeProperty.x};
        // ${body.fileName} is kept as-is and Camel Simple OGNL resolves it at runtime.
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("fileread: Reading " + logPath));

        String uri;
        if (dynamic) {
            // Resolve dir/file expressions into _fr_dir/_fr_file properties using
            // Camel Simple (so ${body.filePath} → FileEntry.getFilePath() etc.), then
            // normalizeReadPath splits absolute filenames into dir + name:
            //   _fr_dir=C:/files, _fr_file=C:\files\readme.txt
            //   → _fr_dir=C:/files, _fr_file=readme.txt
            steps.add(ConversionUtils.setVarExpr("_fr_dir",
                ConversionUtils.simpleOrConstant(dir)));
            steps.add(ConversionUtils.setVarExpr("_fr_file",
                file.isEmpty() ? Map.of("constant", "") : ConversionUtils.simpleOrConstant(file)));
            steps.add(beanStep("fileHelper", "normalizeReadPath"));
            uri = "file:${exchangeProperty._fr_dir}"
                + "?fileName=${exchangeProperty._fr_file}&noop=true&idempotent=false";
        } else {
            // Static: pre-check for a clear error, then build constant URI
            String safePath = ConversionUtils.escapeJs(
                (file.isEmpty() ? dir : dir + "/" + file).replace('\\', '/'));
            steps.add(ConversionUtils.scriptStep("js",
                "var Files=Java.type('java.nio.file.Files');" +
                "var Paths=Java.type('java.nio.file.Paths');" +
                "if(!Files.exists(Paths.get('" + safePath + "')))" +
                "{throw new Error('File not found: " + safePath + "');}"));
            uri = "file:" + dir.replace('\\', '/')
                + (file.isEmpty() ? "?" : "?fileName=" + file + "&")
                + "noop=true&idempotent=false";
        }

        Map<String, Object> pollBody = new LinkedHashMap<>();
        pollBody.put("expression", dynamic ? Map.of("simple", uri) : Map.of("constant", uri));
        pollBody.put("timeout", 5000L);
        Map<String, Object> pollStep = new LinkedHashMap<>();
        pollStep.put("pollEnrich", pollBody);

        steps.add(pollStep);
        if (!resultVar.isEmpty())
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("simple", "${body}")));

        String onSuccess = data.path("onSuccess").asText("none").trim();
        if ("delete".equals(onSuccess)) {
            steps.add(ConversionUtils.scriptStep("js",
                "var Files=Java.type('java.nio.file.Files');" +
                "var Paths=Java.type('java.nio.file.Paths');" +
                "var _absPath=String(exchange.getMessage().getHeader('CamelFileAbsolutePath'));" +
                "Files.deleteIfExists(Paths.get(_absPath));"));
        } else if ("move".equals(onSuccess)) {
            String moveDir  = data.path("moveDirectory").asText("").trim();
            String moveName = data.path("moveFileName").asText("").trim();
            String moveDirJs = moveDir.isEmpty()
                ? "'./processed'"
                : moveDir.contains("${")
                    ? "String(" + ConversionUtils.simpleToJs(moveDir) + ")"
                    : "'" + ConversionUtils.escapeJs(moveDir.replace('\\', '/')) + "'";
            String moveNameJs = moveName.isEmpty()
                ? "String(exchange.getMessage().getHeader('CamelFileName'))"
                : moveName.contains("${")
                    ? "String(" + ConversionUtils.simpleToJs(moveName) + ")"
                    : "'" + ConversionUtils.escapeJs(moveName) + "'";
            steps.add(ConversionUtils.scriptStep("js",
                "var Files=Java.type('java.nio.file.Files');" +
                "var Paths=Java.type('java.nio.file.Paths');" +
                "var CopyOption=Java.type('java.nio.file.StandardCopyOption');" +
                "var _absPath=String(exchange.getMessage().getHeader('CamelFileAbsolutePath'));" +
                "var _moveDir=" + moveDirJs + ";" +
                "var _moveName=" + moveNameJs + ";" +
                "var _src=Paths.get(_absPath);" +
                "var _dst=Paths.get(_moveDir+'/'+_moveName);" +
                "if(_dst.getParent()!=null)Files.createDirectories(_dst.getParent());" +
                "Files.move(_src,_dst,CopyOption.REPLACE_EXISTING);"));
        }

        steps.add(ConversionUtils.stripCamelHeaders());
        return steps;
    }

    // ── Write (Camel file producer) ───────────────────────────────────────────

    private List<Map<String, Object>> convertFileWrite(JsonNode data) {
        String directory   = data.path("directory").asText("").trim();
        String fileName    = data.path("fileName").asText("").trim();
        boolean overwrite  = data.path("overwriteExisting").asBoolean(false);
        boolean createDirs = data.path("createDirs").asBoolean(true);
        String resultVar   = data.path("resultVar").asText("").trim();
        if (directory.isEmpty()) directory = ".";
        String dir = ConversionUtils.uiToSimple(directory.replace('\\', '/'));
        String fileNameSimple = ConversionUtils.uiToSimple(fileName);

        String uri = "file:" + dir;
        String sep = "?";
        if (!fileNameSimple.isEmpty()) { uri += sep + "fileName=" + fileNameSimple; sep = "&"; }
        if (createDirs)                { uri += sep + "autoCreate=true";             sep = "&"; }
        if (overwrite)                 { uri += sep + "fileExist=Override";          sep = "&"; }

        String logTarget = fileName.isEmpty() ? directory + "/<original name>" : directory + "/" + fileName;
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("filewrite: Writing to " + logTarget));
        steps.add(uri.contains("${") ? ConversionUtils.toDStep(uri) : ConversionUtils.toStep(uri, null));

        if (!resultVar.isEmpty()) {
            steps.add(ConversionUtils.setVarExpr(resultVar, Map.of("simple", "${body}")));
        }
        return steps;
    }

    // ── Append ────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertFileAppend(JsonNode data) {
        String filePath  = data.path("filePath").asText("output.txt").trim();
        String content   = data.path("content").asText("").trim();
        boolean newLine  = data.path("newLine").asBoolean(false);
        String resultVar = data.path("resultVar").asText("").trim();
        if (filePath.isEmpty()) filePath = "output.txt";
        String pExpr = pathExpr(filePath);
        String getContent = content.isEmpty()
            ? "String(exchange.getMessage().getBody(java.lang.String.class)||'')"
            : ConversionUtils.simpleToJs(content);
        String script =
            "var Files=Java.type('java.nio.file.Files');" +
            "var Paths=Java.type('java.nio.file.Paths');" +
            "var OO=Java.type('java.nio.file.StandardOpenOption');" +
            "var _p=Paths.get(" + pExpr + ");" +
            "if(_p.getParent()!=null)Files.createDirectories(_p.getParent());" +
            "var _s=String((" + getContent + ")||'');" +
            (newLine ? "if(Files.exists(_p)&&Files.size(_p)>0)_s='\\n'+_s;" : "") +
            "Files.writeString(_p,_s,OO.CREATE,OO.APPEND);" +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_s);");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("fileappend: Appending to file " + filePath));
        steps.add(ConversionUtils.scriptStep("js", script));
        return steps;
    }

    // ── Move / Copy ───────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertFileMove(JsonNode data) {
        String src       = data.path("sourcePath").asText("").trim();
        String dest      = data.path("destinationPath").asText("").trim();
        boolean overwrite  = data.path("overwriteExisting").asBoolean(false);
        boolean createDir  = data.path("createDestinationDir").asBoolean(false);
        boolean copyOnly   = data.path("copyOnly").asBoolean(false);
        String resultVar   = data.path("resultVar").asText("").trim();
        if (src.isEmpty())  src  = "./source.txt";
        if (dest.isEmpty()) dest = "./dest.txt";
        String srcExpr  = pathExpr(src);
        String destExpr = pathExpr(dest);
        String copyOpt  = overwrite ? ",Java.type('java.nio.file.StandardCopyOption').REPLACE_EXISTING" : "";
        String script =
            "var Files=Java.type('java.nio.file.Files');" +
            "var Paths=Java.type('java.nio.file.Paths');" +
            "var _src=Paths.get(" + srcExpr + ");" +
            "var _dst=Paths.get(" + destExpr + ");" +
            (createDir ? "if(_dst.getParent()!=null)Files.createDirectories(_dst.getParent());" : "") +
            (copyOnly  ? "Files.copy(_src,_dst" + copyOpt + ");"
                       : "Files.move(_src,_dst" + copyOpt + ");") +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_dst.toString());");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg((copyOnly ? "filecopy" : "filemove") + ": " + src + " -> " + dest));
        steps.add(ConversionUtils.scriptStep("js", script));
        return steps;
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertFileDelete(JsonNode data) {
        String filePath        = data.path("filePath").asText("").trim();
        boolean ignoreNotFound = data.path("ignoreNotFound").asBoolean(false);
        String resultVar       = data.path("resultVar").asText("").trim();
        if (filePath.isEmpty()) filePath = "./file.txt";
        String pExpr = pathExpr(filePath);
        String script =
            "var Files=Java.type('java.nio.file.Files');" +
            "var Paths=Java.type('java.nio.file.Paths');" +
            "var _p=Paths.get(" + pExpr + ");" +
            (ignoreNotFound
                ? "var _deleted=Files.deleteIfExists(_p);"
                : "Files.delete(_p);var _deleted=true;") +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_deleted);");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("filedelete: Deleting file " + filePath));
        steps.add(ConversionUtils.scriptStep("js", script));
        return steps;
    }

    // ── Exists ────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertFileExists(JsonNode data) {
        String filePath   = data.path("filePath").asText("").trim();
        String resultVar  = data.path("resultVar").asText("").trim();
        String onNotFound = data.path("onNotFound").asText("continue");
        String pExpr = pathExpr(filePath);
        String script =
            "var Files=Java.type('java.nio.file.Files');" +
            "var Paths=Java.type('java.nio.file.Paths');" +
            "var _exists=Files.exists(Paths.get(" + pExpr + "));" +
            (resultVar.isEmpty() ? "" : "exchange.setProperty('" + ConversionUtils.escapeJs(resultVar) + "',_exists);") +
            ("stop".equals(onNotFound) ? "if(!_exists){throw new Error('File not found: '+" + pExpr + ");}" : "");
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("fileexists: Checking file " + filePath));
        steps.add(ConversionUtils.scriptStep("js", script));
        return steps;
    }

    // ── JSON Config ───────────────────────────────────────────────────────────

    private List<Map<String, Object>> convertJsonConfig(JsonNode data) {
        String filePath = data.path("filePath").asText("").trim();
        String prefix   = data.path("prefix").asText("").trim();
        boolean flatten = data.path("flatten").asBoolean(true);
        if (filePath.isEmpty()) filePath = "./config.json";
        String pExpr       = pathExpr(filePath);
        String safePrefix  = ConversionUtils.escapeJs(prefix);
        String flattenFn =
            "(function _set(obj,pfx){" +
            "var keys=Object.keys(obj);" +
            "for(var _ki=0;_ki<keys.length;_ki++){" +
            "var k=keys[_ki];" +
            "var fk=pfx?pfx+'.'+k:k;" +
            "var v=obj[k];" +
            "if(v!==null&&v!==undefined&&typeof v==='object'&&!Array.isArray(v)){_set(v,fk);}" +
            "else{exchange.setProperty(fk,v==null?null:String(v));}" +
            "}" +
            "}(_json,'" + safePrefix + "'));";
        String shallowFn =
            "(function(){" +
            "var keys=Object.keys(_json);" +
            "for(var _ki=0;_ki<keys.length;_ki++){" +
            "var k=keys[_ki];" +
            "var fk=" + (prefix.isEmpty() ? "k" : "'" + safePrefix + ".'+k") + ";" +
            "var v=_json[k];" +
            "exchange.setProperty(fk,v==null?null:String(v));" +
            "}" +
            "}());";
        String script =
            "var Files=Java.type('java.nio.file.Files');" +
            "var Paths=Java.type('java.nio.file.Paths');" +
            "var _p=" + pExpr + ";" +
            "if(!Files.exists(Paths.get(_p))){throw new Error('JSON config file not found: '+_p);}" +
            "var _json=JSON.parse(Files.readString(Paths.get(_p)));" +
            (flatten ? flattenFn : shallowFn);
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("jsonconfig: Loading variables from " + filePath));
        steps.add(ConversionUtils.scriptStep("js", script));
        return steps;
    }

    // ── List (via FileHelper Java bean — same pattern as SftpHelper / FtpHelper) ──

    private List<Map<String, Object>> convertFileList(JsonNode data) {
        String dirPath    = data.path("dirPath").asText(".").trim();
        String filter     = data.path("filter").asText("").trim();
        boolean recursive = data.path("recursive").asBoolean(false);
        String resultVar  = data.path("resultVar").asText("").trim();

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(ConversionUtils.logMsg("filelist: Listing directory " + dirPath));
        steps.add(ConversionUtils.setVarExpr("_op_dir",       ConversionUtils.simpleOrConstant(dirPath)));
        steps.add(ConversionUtils.setVarExpr("_op_filter",    Map.of("constant", filter)));
        steps.add(ConversionUtils.setVarExpr("_op_recursive", Map.of("constant", String.valueOf(recursive))));
        steps.add(ConversionUtils.setVarExpr("_op_var",       Map.of("constant", resultVar)));
        steps.add(beanStep("fileHelper", "list"));
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
