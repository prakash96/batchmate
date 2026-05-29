package com.batchmate.workflow.plugin.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.camel.Exchange;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

public class CompareHelper {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── JSON compare ──────────────────────────────────────────────────────────

    public void compareJson(Exchange exchange) throws Exception {
        String leftSrc    = prop(exchange, "_cmp_leftSrc",    "body");
        String leftVar    = prop(exchange, "_cmp_leftVar",    "");
        String leftLit    = prop(exchange, "_cmp_leftLit",    "");
        String rightSrc   = prop(exchange, "_cmp_rightSrc",   "literal");
        String rightVar   = prop(exchange, "_cmp_rightVar",   "");
        String rightLit   = prop(exchange, "_cmp_rightLit",   "");
        String mode       = prop(exchange, "_cmp_mode",       "deep-equal");
        boolean ignoreArr = "true".equals(prop(exchange, "_cmp_ignoreArr", "false"));
        String resultVar  = prop(exchange, "_cmp_resultVar",  "");
        String onMismatch = prop(exchange, "_cmp_onMismatch", "stop");

        JsonNode left  = resolveJson(exchange, leftSrc,  leftVar,  leftLit);
        JsonNode right = resolveJson(exchange, rightSrc, rightVar, rightLit);

        boolean matches;
        switch (mode) {
            case "partial":   matches = isSubset(left, right, ignoreArr); break;
            case "keys-only": matches = sameTopLevelKeys(left, right);    break;
            default:          matches = jsonEquals(left, right, ignoreArr); break;
        }

        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, matches);
        if (!matches && "stop".equals(onMismatch)) {
            String actualStr   = MAPPER.writeValueAsString(left);
            String expectedStr = MAPPER.writeValueAsString(right);
            throw new RuntimeException(
                "JSON compare mismatch (mode=" + mode + ")\nactual:   " + actualStr + "\nexpected: " + expectedStr);
        }
    }

    // ── Text compare ──────────────────────────────────────────────────────────

    public void compareText(Exchange exchange) {
        String leftSrc    = prop(exchange, "_cmp_leftSrc",    "body");
        String leftVar    = prop(exchange, "_cmp_leftVar",    "");
        String leftLit    = prop(exchange, "_cmp_leftLit",    "");
        String rightSrc   = prop(exchange, "_cmp_rightSrc",   "literal");
        String rightVar   = prop(exchange, "_cmp_rightVar",   "");
        String rightLit   = prop(exchange, "_cmp_rightLit",   "");
        String mode       = prop(exchange, "_cmp_mode",       "exact");
        boolean cs        = !"false".equals(prop(exchange, "_cmp_caseSensitive", "true"));
        String resultVar  = prop(exchange, "_cmp_resultVar",  "");
        String onMismatch = prop(exchange, "_cmp_onMismatch", "stop");

        String left  = resolveText(exchange, leftSrc,  leftVar,  leftLit);
        String right = resolveText(exchange, rightSrc, rightVar, rightLit);

        String l = cs ? left  : left.toLowerCase();
        String r = cs ? right : right.toLowerCase();

        boolean matches;
        switch (mode) {
            case "contains":    matches = l.contains(r);            break;
            case "starts-with": matches = l.startsWith(r);         break;
            case "ends-with":   matches = l.endsWith(r);           break;
            case "regex":       matches = Pattern.compile(cs ? right : "(?i)" + right).matcher(left).find(); break;
            default:            matches = l.equals(r);             break;
        }

        if (!resultVar.isEmpty()) exchange.setProperty(resultVar, matches);
        if (!matches && "stop".equals(onMismatch)) {
            throw new RuntimeException(
                "Text compare mismatch (mode=" + mode + ")\nactual:   \"" + left + "\"\nexpected: \"" + right + "\"");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private JsonNode resolveJson(Exchange exchange, String source, String varName, String literal) throws Exception {
        switch (source) {
            case "variable": {
                Object v = exchange.getProperty(varName);
                return toJsonNode(v);
            }
            case "literal":
                return MAPPER.readTree(literal);
            default: { // body
                Object body = exchange.getMessage().getBody();
                if (body == null) return MAPPER.nullNode();
                if (body instanceof JsonNode) return (JsonNode) body;
                if (body instanceof String) {
                    String s = ((String) body).strip();
                    return s.isEmpty() ? MAPPER.nullNode() : MAPPER.readTree(s);
                }
                if (body instanceof byte[]) return MAPPER.readTree((byte[]) body);
                // InputStream or StreamCache: use Camel's type converter which
                // respects stream caching and properly reads the response bytes.
                // MAPPER.valueToTree(stream) would serialize the Java object itself — wrong.
                String s = exchange.getMessage().getBody(String.class);
                if (s != null && !s.strip().isEmpty()) {
                    return MAPPER.readTree(s.strip());
                }
                // Last resort: Map / List / POJO (e.g. Jackson auto-deserialized body)
                return MAPPER.valueToTree(body);
            }
        }
    }

    private JsonNode toJsonNode(Object v) throws Exception {
        if (v == null) return MAPPER.nullNode();
        if (v instanceof JsonNode) return (JsonNode) v;
        if (v instanceof String) {
            String s = ((String) v).strip();
            return s.isEmpty() ? MAPPER.nullNode() : MAPPER.readTree(s);
        }
        if (v instanceof byte[])      return MAPPER.readTree((byte[]) v);
        if (v instanceof InputStream) return MAPPER.readTree((InputStream) v);
        return MAPPER.valueToTree(v);
    }

    private String resolveText(Exchange exchange, String source, String varName, String literal) {
        switch (source) {
            case "variable": {
                Object v = exchange.getProperty(varName);
                return v != null ? v.toString() : "";
            }
            case "literal":
                return literal;
            default: { // body
                Object body = exchange.getMessage().getBody();
                if (body == null) return "";
                if (body instanceof String) return (String) body;
                if (body instanceof byte[]) return new String((byte[]) body, StandardCharsets.UTF_8);
                // InputStream / StreamCache
                if (body instanceof InputStream) {
                    String s = exchange.getMessage().getBody(String.class);
                    return s != null ? s : "";
                }
                // Map / List / POJO — use Camel's converter for a best-effort String
                String s = exchange.getMessage().getBody(String.class);
                return s != null ? s : body.toString();
            }
        }
    }

    private boolean jsonEquals(JsonNode a, JsonNode b, boolean ignoreArrayOrder) {
        if (a == null || b == null) return a == b;
        if (!a.getNodeType().equals(b.getNodeType())) return false;
        if (a.isObject()) {
            if (a.size() != b.size()) return false;
            Iterator<Map.Entry<String, JsonNode>> fields = a.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode bVal = b.get(entry.getKey());
                if (bVal == null || !jsonEquals(entry.getValue(), bVal, ignoreArrayOrder)) return false;
            }
            return true;
        }
        if (a.isArray() && ignoreArrayOrder) {
            if (a.size() != b.size()) return false;
            List<JsonNode> aList = new ArrayList<>();
            a.forEach(aList::add);
            List<JsonNode> bList = new ArrayList<>();
            b.forEach(bList::add);
            Comparator<JsonNode> cmp = Comparator.comparing(JsonNode::toString);
            aList.sort(cmp);
            bList.sort(cmp);
            for (int i = 0; i < aList.size(); i++) {
                if (!jsonEquals(aList.get(i), bList.get(i), ignoreArrayOrder)) return false;
            }
            return true;
        }
        return a.equals(b);
    }

    private boolean isSubset(JsonNode left, JsonNode right, boolean ignoreArrayOrder) {
        if (!right.isObject()) return jsonEquals(left, right, ignoreArrayOrder);
        Iterator<Map.Entry<String, JsonNode>> fields = right.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode lVal = left.get(entry.getKey());
            if (lVal == null || !jsonEquals(lVal, entry.getValue(), ignoreArrayOrder)) return false;
        }
        return true;
    }

    private boolean sameTopLevelKeys(JsonNode left, JsonNode right) {
        // Arrays don't have named keys — compare element count and per-element keys
        if (left.isArray() && right.isArray()) {
            if (left.size() != right.size()) return false;
            for (int i = 0; i < left.size(); i++) {
                if (!sameTopLevelKeys(left.get(i), right.get(i))) return false;
            }
            return true;
        }
        if (!left.isObject() || !right.isObject()) return left.equals(right);
        Set<String> lKeys = new TreeSet<>();
        Set<String> rKeys = new TreeSet<>();
        left.fieldNames().forEachRemaining(lKeys::add);
        right.fieldNames().forEachRemaining(rKeys::add);
        return lKeys.equals(rKeys);
    }

    private static String prop(Exchange exchange, String key, String defaultVal) {
        Object v = exchange.getProperty(key);
        return v != null ? v.toString() : defaultVal;
    }
}
