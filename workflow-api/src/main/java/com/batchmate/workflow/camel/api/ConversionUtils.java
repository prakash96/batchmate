package com.batchmate.workflow.camel.api;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared static helpers for building Apache Camel 3.x YAML DSL step maps.
 * Scripts use GraalVM JavaScript (language key "js") registered via JsLanguageRegistrar.
 * Exchange-scoped variables are stored as exchange properties (setProperty).
 * In JS: vars['name'] (vars is bound to exchange.getProperties()) — Camel 3.x has no setVariable DSL step.
 */
public final class ConversionUtils {

    private ConversionUtils() {}

    // ── Step constructors ─────────────────────────────────────────────────────

    public static Map<String, Object> toStep(String uri, Map<String, Object> params) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("uri", uri);
        if (params != null && !params.isEmpty()) body.put("parameters", params);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("to", body);
        return step;
    }

    /** Dynamic to — URI is evaluated as Simple language at runtime. Use when URI contains ${...}. */
    public static Map<String, Object> toDStep(String uri) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("uri", uri);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("toD", body);
        return step;
    }

    /** Returns a Camel expression map using simple when value is dynamic (contains ${...}), constant otherwise. */
    public static Map<String, Object> simpleOrConstant(String value) {
        String converted = uiToSimple(value);
        return converted.contains("${") ? Map.of("simple", converted) : Map.of("constant", converted);
    }

    public static Map<String, Object> setBodyConstant(String value) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expression", Map.of("constant", value));
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("setBody", body);
        return step;
    }

    public static Map<String, Object> logMsg(String msg) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", toSimpleMsg(msg));
        body.put("logName", "com.batchmate.workflow.execution");
        body.put("loggingLevel", "INFO");
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("log", body);
        return step;
    }

    /** Converts UI shorthands in a log message string to Simple language equivalents. */
    public static String toSimpleMsg(String msg) {
        if (msg == null) return null;
        return msg.replaceAll("\\$\\{vars\\.([\\w]+)\\}", "\\${exchangeProperty.$1}")
                  .replaceAll("\\$\\{headers\\.([\\w]+)\\}", "\\${header.$1}");
    }

    /**
     * Renames all Camel-prefixed headers to camelCase.
     * e.g. CamelFileName → fileName, CamelFileLength → fileLength
     */
    public static Map<String, Object> stripCamelHeaders() {
        String script =
            "var ArrayList=Java.type('java.util.ArrayList');" +
            "var _ks=new ArrayList(exchange.getMessage().getHeaders().keySet());" +
            "for(var _i=0;_i<_ks.size();_i++){" +
            "var _k=String(_ks.get(_i));" +
            "if(_k.startsWith('Camel')&&_k.length>5){" +
            "var _nk=_k.charAt(5).toLowerCase()+_k.substring(6);" +
            "exchange.getMessage().setHeader(_nk,exchange.getMessage().getHeader(_k));" +
            "exchange.getMessage().removeHeader(_k);" +
            "}}";
        return scriptStep("js", script);
    }

    /** Generic script step — pass "js" for GraalVM JavaScript. */
    public static Map<String, Object> scriptStep(String lang, String script) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expression", Map.of(lang, script));
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("script", body);
        return step;
    }

    /**
     * setProperty step (Camel 3.x — there is no setVariable in Camel 3.x DSL).
     * Properties are accessible in JS via: vars['name'] (vars = exchange.getProperties())
     */
    public static Map<String, Object> setVarExpr(String name, Map<String, Object> expression) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("expression", expression);
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("setProperty", body);
        return step;
    }

    /**
     * Snapshots every header currently on the message — call this right before the HTTP call,
     * once all outgoing request headers have been set. Camel's http producer reuses the SAME
     * Message object for the response rather than starting from a clean one, so any header the
     * request set (a custom auth header, "Accept-Encoding", etc.) is still sitting there
     * afterward unless the response happens to overwrite that exact key — meaning code reading
     * "the response's headers" post-call actually sees request headers bleeding through mixed in
     * with the genuine response ones. Pairs with stripStaleRequestHeaders(), which removes
     * whatever this snapshot shows is unchanged after the call — i.e. never touched by the
     * response — leaving only headers the response actually sent or overwrote.
     */
    public static Map<String, Object> snapshotOutgoingHeaders() {
        String script =
            "var _snap=new java.util.LinkedHashMap();" +
            "var _ks=exchange.getMessage().getHeaders().keySet().toArray();" +
            "for(var _i=0;_i<_ks.length;_i++){" +
            "  var _k=String(_ks[_i]);" +
            "  var _v=exchange.getMessage().getHeaders().get(_k);" +
            "  _snap.put(_k,_v==null?null:String(_v));" +
            "}" +
            "exchange.setProperty('_outgoingHeaderSnapshot',_snap);";
        return scriptStep("js", script);
    }

    /**
     * After the HTTP call (+ readHttpBody/mapHttpResponseHeaders), removes any header whose value
     * is IDENTICAL to what snapshotOutgoingHeaders() captured before the call — i.e. a request
     * header the response never actually set or overwrote, so it's stale outgoing-request cruft,
     * not a real response header. See snapshotOutgoingHeaders' javadoc for why this is needed.
     */
    public static Map<String, Object> stripStaleRequestHeaders() {
        String script =
            "var _snap=exchange.getProperty('_outgoingHeaderSnapshot');" +
            "if(_snap!=null){" +
            "  var _ks=exchange.getMessage().getHeaders().keySet().toArray();" +
            "  for(var _i=0;_i<_ks.length;_i++){" +
            "    var _k=String(_ks[_i]);" +
            "    if(_snap.containsKey(_k)){" +
            "      var _before=_snap.get(_k);" +
            "      var _now=exchange.getMessage().getHeaders().get(_k);" +
            "      var _nowStr=(_now==null?null:String(_now));" +
            "      if(_before===_nowStr){exchange.getMessage().getHeaders().remove(_k);}" +
            "    }" +
            "  }" +
            "  exchange.removeProperty('_outgoingHeaderSnapshot');" +
            "}";
        return scriptStep("js", script);
    }

    /**
     * After an HTTP call, copies all CamelHttp* headers to non-Camel equivalents.
     * e.g. CamelHttpResponseCode → httpResponseCode, CamelHttpResponseText → httpResponseText
     */
    public static Map<String, Object> mapHttpResponseHeaders() {
        String script =
            "var _m=exchange.getMessage();" +
            "var _ks=_m.getHeaders().keySet().toArray();" +
            "for(var _i=0;_i<_ks.length;_i++){" +
            "  var _k=String(_ks[_i]);" +
            "  if(_k.startsWith('CamelHttp')){" +
            "    var _nk=_k.substring(5,6).toLowerCase()+_k.substring(6);" +
            "    _m.getHeaders().put(_nk,_m.getHeaders().get(_k));" +
            "  }" +
            "}";
        return scriptStep("js", script);
    }

    /**
     * After an HTTP call, reads the body as a String — decompressing gzip if Content-Encoding: gzip
     * is present. Handles both shapes Apache HttpClient hands back depending on response size/
     * content: an InputStream (stream-caching is disabled so Camel does not decompress it
     * automatically), AND a raw byte[] (camel-http commonly returns bodies this way instead —
     * without this branch a byte[] body is left completely unconverted, so any mid-route Simple/JS
     * expression reading "body" gets JS's array-like String(byte[]) — a comma-joined list of byte
     * values, e.g. "123,34,97,..." — instead of the actual text).
     */
    public static Map<String, Object> readHttpBody() {
        String script =
            "var _b=exchange.getMessage().getBody();" +
            "var _is=null;" +
            "if(_b instanceof java.io.InputStream){_is=_b;}" +
            "else if(_b!=null && _b.getClass && _b.getClass().isArray()){_is=new java.io.ByteArrayInputStream(_b);}" +
            "if(_is!=null){" +
            "  var _ce=String(exchange.getMessage().getHeader('Content-Encoding')||'');" +
            "  var _gz=_ce.toLowerCase().indexOf('gzip')>=0;" +
            "  if(_gz)_is=new java.util.zip.GZIPInputStream(_is);" +
            "  var _isr=new java.io.InputStreamReader(_is,'UTF-8');" +
            "  var _br=new java.io.BufferedReader(_isr);" +
            "  var _sb=new java.lang.StringBuilder();" +
            "  var _ln;" +
            "  while((_ln=_br.readLine())!==null){_sb.append(_ln).append('\\n');}" +
            "  _br.close();" +
            "  exchange.getMessage().setBody(_sb.toString().trim());" +
            "  if(_gz)exchange.getMessage().removeHeader('Content-Encoding');" +
            "}";
        return scriptStep("js", script);
    }

    /**
     * Converts a UI-style expression (${vars.X}, ${headers.X}) to Camel Simple language
     * for embedding in endpoint URIs when dynamic evaluation is needed at runtime.
     */
    public static String uiToSimple(String expr) {
        if (expr == null) return "";
        return expr
            .replaceAll("\\$\\{vars\\.([\\w.]+)\\}", "\\${exchangeProperty.$1}")
            .replaceAll("\\$\\{headers\\.([\\w.]+)\\}", "\\${header.$1}");
    }

    public static List<Map<String, Object>> pollEnrich(String uri, String resultVar) {
        return pollEnrich(uri, resultVar, 60_000L);
    }

    public static List<Map<String, Object>> pollEnrich(String uri, String resultVar, long timeoutMs) {
        boolean dynamic = uri.contains("${");
        Map<String, Object> pollBody = new LinkedHashMap<>();
        pollBody.put("expression", dynamic ? Map.of("simple", uri) : Map.of("constant", uri));
        pollBody.put("timeout", timeoutMs);
        Map<String, Object> poll = new LinkedHashMap<>();
        poll.put("pollEnrich", pollBody);

        // Camel's FTP/SFTP type converter turns GenericFile/RemoteFile into a streaming
        // InputStream backed by the locally-downloaded temp file. Camel cleans up the
        // temp file after the route completes according to the noop/delete/move URI option.
        Map<String, Object> convertBody = new LinkedHashMap<>();
        convertBody.put("type", "java.io.InputStream");
        Map<String, Object> convert = new LinkedHashMap<>();
        convert.put("convertBodyTo", convertBody);

        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(poll);
        steps.add(convert);
        if (resultVar != null && !resultVar.isEmpty())
            steps.add(setVarExpr(resultVar, Map.of("simple", "${body}")));
        return steps;
    }

    public static List<Map<String, Object>> webhookPost(String url, String jsonBody) {
        List<Map<String, Object>> steps = new ArrayList<>();
        steps.add(setBodyConstant(jsonBody));
        String sep = url.contains("?") ? "&" : "?";
        steps.add(toStep(url + sep + "httpMethod=POST", null));
        return steps;
    }

    // ── Expression resolution ─────────────────────────────────────────────────

    /**
     * Returns a Camel language expression map for an arbitrary expression string.
     * Strings wrapped in ${...} are unwrapped and used as JS expressions verbatim.
     * Everything else is treated as a constant value.
     */
    public static Map<String, Object> exprMap(String expr) {
        if (expr == null || expr.isBlank()) return Map.of("js", "body");
        if (expr.contains("${"))           return Map.of("js", simpleToJs(expr));
        return Map.of("constant", expr);
    }

    /**
     * Unwraps UI-style ${...} delimiters into a JS expression, converting vars.X
     * references to exchange.getProperties().get('X').
     * A single ${jsExpr} → jsExpr (with vars replaced).
     * A string template like "prefix ${jsExpr} suffix" → 'prefix' + jsExpr + ' suffix'.
     */
    public static String simpleToJs(String expr) {
        if (expr == null) return "null";
        String trimmed = expr.trim();
        // Single wrapper: ${jsExpr} — strip delimiters and convert vars references
        if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
            String inner = trimmed.substring(2, trimmed.length() - 1);
            if (!inner.contains("${")) return replaceVars(inner);
        }
        // Template with mixed literal text and ${...} expressions
        StringBuilder sb = new StringBuilder();
        int i = 0;
        boolean first = true;
        while (i < trimmed.length()) {
            int start = trimmed.indexOf("${", i);
            if (start < 0) {
                if (!first) sb.append(" + ");
                sb.append("'").append(escapeJs(trimmed.substring(i))).append("'");
                break;
            }
            if (start > i) {
                if (!first) sb.append(" + ");
                sb.append("'").append(escapeJs(trimmed.substring(i, start))).append("'");
                first = false;
            }
            int end = trimmed.indexOf("}", start);
            if (end < 0) break;
            if (!first) sb.append(" + ");
            sb.append(replaceVars(trimmed.substring(start + 2, end)));
            first = false;
            i = end + 1;
        }
        return sb.toString();
    }

    // ── Condition / comparison builders (GraalVM JavaScript) ─────────────────

    public static String buildConditionJs(JsonNode data) {
        JsonNode conditions = data.path("conditions");
        if (!conditions.isArray() || conditions.size() == 0) {
            String exprType = data.path("expressionType").asText("").trim();
            String fallback = jsValue(exprType.isEmpty() ? "body" : exprType,
                                      data.path("expression").asText(""),
                                      data.path("literal").asText(""));
            return fallback + " === true";
        }
        List<String> parts = new ArrayList<>();
        for (JsonNode c : conditions) {
            String left  = jsValue(c.path("leftSource").asText("body"),
                                   c.path("leftExpr").asText(""),
                                   c.path("leftLiteral").asText(""));
            String op    = jsOp(c.path("operator").asText("=="));
            String right = jsValue(c.path("rightSource").asText("literal"),
                                   c.path("rightExpr").asText(""),
                                   c.path("rightLiteral").asText(""));
            parts.add(left + " " + op + " " + right);
        }
        String logical = data.path("logical").asText("AND");
        String joiner  = "AND".equalsIgnoreCase(logical) ? " && " : " || ";
        return String.join(joiner, parts);
    }

    public static String buildAssertionJs(JsonNode data) {
        JsonNode conditions = data.isArray() ? data : data.path("conditions");
        if (conditions == null || !conditions.isArray() || conditions.size() == 0) return "true";
        String logical = data.isArray() ? "AND" : data.path("logic").asText("AND");
        List<String> parts = new ArrayList<>();
        for (JsonNode c : conditions) {
            String left  = resolveAssertionExpr(c.path("left").asText("").trim());
            String op    = c.path("operator").asText("==");
            String right = resolveAssertionExpr(c.path("right").asText("").trim());
            String part;
            if ("notNull".equals(op)) {
                part = "(" + left + " !== null && " + left + " !== undefined)";
            } else if ("contains".equals(op)) {
                part = "String(" + left + ").includes(String(" + right + "))";
            } else if ("typeof".equals(op)) {
                String rawRight = c.path("right").asText("").trim();
                part = "(typeof " + left + " === '" + escapeJs(rawRight) + "')";
            } else {
                part = "String(" + left + ") " + jsOp(op) + " String(" + right + ")";
            }
            parts.add(part);
        }
        String joiner = "OR".equalsIgnoreCase(logical) ? " || " : " && ";
        return String.join(joiner, parts);
    }

    /**
     * Like buildAssertionJs but generates a self-contained script that throws with
     * per-condition actual/expected details when one or more conditions fail.
     */
    public static String buildAssertionJsDetailed(JsonNode data) {
        JsonNode conditions = data.isArray() ? data : data.path("conditions");
        if (conditions == null || !conditions.isArray() || conditions.size() == 0) return "// no conditions";
        String logical = data.isArray() ? "AND" : data.path("logic").asText("AND");
        boolean isOr = "OR".equalsIgnoreCase(logical);
        int n = conditions.size();

        StringBuilder sb = new StringBuilder("var _failures=[];");
        for (int i = 0; i < n; i++) {
            JsonNode c = conditions.get(i);
            String leftExpr  = resolveAssertionExpr(c.path("left").asText("").trim());
            String op        = c.path("operator").asText("==");
            String rightExpr = resolveAssertionExpr(c.path("right").asText("").trim());
            String rawRight  = c.path("right").asText("").trim();

            sb.append("var _l").append(i).append("=(").append(leftExpr).append(");");

            String check, failMsg;
            switch (op) {
                case "notNull":
                    check   = "(_l" + i + "!==null&&_l" + i + "!==undefined)";
                    failMsg = "'actual='+String(_l" + i + ")+'  expected: not null'";
                    break;
                case "contains":
                    sb.append("var _r").append(i).append("=(").append(rightExpr).append(");");
                    check   = "String(_l" + i + ").includes(String(_r" + i + "))";
                    failMsg = "'actual=\"'+String(_l" + i + ")+'\"  expected to contain: \"'+String(_r" + i + ")+'\"'";
                    break;
                case "typeof":
                    check   = "(typeof _l" + i + "==='" + escapeJs(rawRight) + "')";
                    failMsg = "'actual typeof='+typeof _l" + i + "+'  expected type: " + escapeJs(rawRight) + "'";
                    break;
                default:
                    sb.append("var _r").append(i).append("=(").append(rightExpr).append(");");
                    check   = "String(_l" + i + ")" + jsOp(op) + "String(_r" + i + ")";
                    failMsg = "'actual=\"'+String(_l" + i + ")+'\"  expected " + escapeJs(op) + " \"'+String(_r" + i + ")+'\"'";
                    break;
            }
            sb.append("if(!(").append(check).append("))_failures.push('Condition ").append(i + 1).append(": '+").append(failMsg).append(");");
        }
        if (isOr) {
            sb.append("if(_failures.length===").append(n)
              .append(")throw new Error('Assertion failed (no condition passed):\\n'+_failures.join('\\n'));");
        } else {
            sb.append("if(_failures.length>0)throw new Error('Assertion failed:\\n'+_failures.join('\\n'));");
        }
        return sb.toString();
    }

    private static String resolveAssertionExpr(String expr) {
        if (expr.isEmpty()) return "''";
        try { Double.parseDouble(expr); return expr; } catch (NumberFormatException ignored) {}
        return replaceVars(expr);
    }

    public static String buildCompareJs(JsonNode data, String mode, boolean text) {
        String left  = jsValue(data.path("leftSource").asText("body"),
                               data.path("leftExpr").asText(""),
                               data.path("leftLiteral").asText(""));
        String right = jsValue(data.path("rightSource").asText("literal"),
                               data.path("rightExpr").asText(""),
                               data.path("rightLiteral").asText(""));
        if (text) {
            boolean cs = data.path("caseSensitive").asBoolean(true);
            String l = cs ? "String(" + left + ")" : "String(" + left + ").toLowerCase()";
            String r = cs ? "String(" + right + ")" : "String(" + right + ").toLowerCase()";
            switch (mode) {
                case "contains":    return l + ".includes(" + r + ")";
                case "starts-with": return l + ".startsWith(" + r + ")";
                case "ends-with":   return l + ".endsWith(" + r + ")";
                case "regex":
                    return "new RegExp(String(" + right + ")" + (cs ? "" : ", 'i'") + ").test(String(" + left + "))";
                default:            return l + " === " + r;
            }
        }
        // _p: safely parses a value to a JS object — handles String body and auto-converted Java Map/List
        String helper = "function _p(v){return typeof v==='string'?JSON.parse(v):v;}";
        switch (mode) {
            case "partial":
                return "(function(){" + helper
                     + "var _l=_p(" + left + "),_r=_p(" + right + ");"
                     + "return Object.keys(_r).every(function(k){"
                     + "return JSON.stringify(_l[k])===JSON.stringify(_r[k]);});})()";
            case "keys-only":
                return "(function(){" + helper
                     + "var _l=_p(" + left + "),_r=_p(" + right + ");"
                     + "var lk=Object.keys(_l).sort(),rk=Object.keys(_r).sort();"
                     + "return lk.length===rk.length&&lk.every(function(k,i){return k===rk[i]});})()";
            default: // deep-equal
                return "(function(){" + helper
                     + "return JSON.stringify(_p(" + left + "))===JSON.stringify(_p(" + right + "));})()";
        }
    }

    // ── GraalVM JS value / operator helpers ───────────────────────────────────

    /**
     * Builds a GraalVM JS inline expression that resolves a value from the exchange.
     * Properties written by setProperty are read with exchange.getProperties().get(name).
     */
    public static String jsValue(String source, String expr, String literal) {
        switch (source) {
            case "body":
                return "exchange.getMessage().getBody()";
            case "variable":
                return "(function(){var _v=exchange.getProperties().get('"
                       + escapeJs(expr) + "');return _v!=null?String(_v):null;})()";
            case "expression":
                return expr.isBlank() ? "null" : expr;
            case "literal":
                return "'" + escapeJs(literal) + "'";
            default:
                return "null";
        }
    }

    /** Rewrites UI shorthands to explicit Camel JS expressions:
     *  vars.X    → exchange.properties.get('X')
     *  headers.X → exchange.in.headers.get('X')
     *  body      → parsed JS object (handles byte[] from marshal step or plain String)
     */
    public static String replaceVars(String js) {
        if (js == null) return null;
        String result = js;

        // 1. body.property — Map / POJO bean-getter / JSON-aware access.
        //    Resolution order:
        //      a) Map.get(key)                       — LinkedHashMap items
        //      b) explicit getter call (getFileName) — Java POJOs (FileEntry etc.)
        //         GraalVM HostAccess.ALL exposes methods by name but does NOT auto-map
        //         bean getters as JS properties, so _b['fileName'] returns undefined.
        //         We construct 'get' + capitalise(key) and call it directly.
        //      c) JSON.parse(body)[key]              — JSON string body
        //    Negative lookahead excludes method calls like body.contains(...).
        result = result.replaceAll("\\bbody\\.([\\w]+)(?!\\s*\\()",
            "(function(){var _b=exchange.getMessage().getBody();"
            + "if(_b==null)return null;"
            + "if(_b instanceof java.util.Map)return _b.get('$1');"
            + "try{var _gn='get'+'$1'[0].toUpperCase()+'$1'.slice(1);"
            + "if(typeof _b[_gn]==='function')return _b[_gn]();}catch(_ge){}"
            + "try{var _s=_b instanceof java.lang.String?_b:new java.lang.String(_b);"
            + "return JSON.parse(_s)['$1'];}catch(e){return null;}})()");

        // 2. vars.name.property — same three-tier resolution on the stored variable.
        //    Negative lookahead excludes vars.item.contains(...) etc.
        result = result.replaceAll("vars\\.([\\w]+)\\.([\\w]+)(?!\\s*\\()",
            "(function(){var _v=exchange.getProperties().get('$1');"
            + "if(_v==null)return null;"
            + "if(_v instanceof java.util.Map)return _v.get('$2');"
            + "try{var _gn='get'+'$2'[0].toUpperCase()+'$2'.slice(1);"
            + "if(typeof _v[_gn]==='function')return _v[_gn]();}catch(_ge){}"
            + "try{return JSON.parse(String(_v))['$2'];}catch(e){return null;}})()");

        // 3. vars.name — single-level variable
        result = result.replaceAll("vars\\.([\\w]+)", "exchange.getProperties().get('$1')");

        // 4. headers.name
        result = result.replaceAll("headers\\.([\\w]+)", "exchange.getMessage().getHeaders().get('$1')");

        // 5. Remaining bare 'body' — return the raw body without JSON-parsing.
        //    JSON parsing breaks when the body is a GenericFile (after pollEnrich file read).
        //    Callers that need JSON access use body.property (handled by step 1 above).
        if (result.matches("(?s).*\\bbody\\b.*")) {
            result = result.replaceAll("\\bbody\\b", "exchange.getMessage().getBody()");
        }
        return result;
    }

    public static String jsOp(String op) {
        switch (op) {
            case "neq": case "!=": return "!==";
            case "gt":  case ">":  return ">";
            case "gte": case ">=": return ">=";
            case "lt":  case "<":  return "<";
            case "lte": case "<=": return "<=";
            default:               return "===";
        }
    }

    // ── URI builders ──────────────────────────────────────────────────────────

    public static String sftpUri(String scheme, JsonNode data, String remotePath) {
        String host     = data.path("host").asText("localhost");
        int    port     = data.path("port").asInt(22);
        String username = data.path("username").asText("").trim();
        String password = data.path("password").asText("").trim();
        return scheme + "://" + credentials(username, password) + host + ":" + port + remotePath
                + "?preferredAuthentications=publickey,keyboard-interactive,password";
    }

    public static String ftpUri(String scheme, JsonNode data, String remotePath) {
        String host     = data.path("host").asText("localhost");
        int    port     = data.path("port").asInt(21);
        String username = data.path("username").asText("").trim();
        String password = data.path("password").asText("").trim();
        return scheme + "://" + credentials(username, password) + host + ":" + port + remotePath;
    }

    /** Builds the user:pass@ authority prefix for FTP/SFTP URIs, percent-encoding both values. */
    private static String credentials(String username, String password) {
        if (username.isEmpty()) return "";
        String encodedUser = uriEncode(username);
        if (password.isEmpty()) return encodedUser + "@";
        return encodedUser + ":" + uriEncode(password) + "@";
    }

    private static String uriEncode(String s) {
        if (s.startsWith("{{") && s.endsWith("}}")) return s; // Camel placeholder — don't encode
        try {
            return java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
    }

    // ── String escaping ───────────────────────────────────────────────────────

    public static String escapeJs(String s) {
        return s.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }

    public static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** Splits "/a/b/c/file.txt" or "C:\a\b\file.txt" → [dir, filename] with forward slashes. */
    public static String[] splitPath(String fullPath) {
        String normalized = fullPath.replace('\\', '/');
        int last = normalized.lastIndexOf('/');
        if (last < 0) return new String[]{".", normalized};
        return new String[]{normalized.substring(0, last), normalized.substring(last + 1)};
    }
}
