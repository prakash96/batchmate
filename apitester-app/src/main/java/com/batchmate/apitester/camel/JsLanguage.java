package com.batchmate.apitester.camel;

import com.oracle.truffle.js.scriptengine.GraalJSScriptEngine;
import org.apache.camel.Exchange;
import org.apache.camel.Expression;
import org.apache.camel.Predicate;
import org.apache.camel.RuntimeCamelException;
import org.apache.camel.support.ExpressionAdapter;
import org.apache.camel.support.LanguageSupport;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.HostAccess;

import javax.script.ScriptEngine;
import javax.script.ScriptException;

/**
 * Camel language backed by GraalVM JavaScript — copied verbatim from workflow-app.
 * Host access is enabled so that exchange.properties, exchange.getMessage(), etc.
 * resolve via JavaBean convention from within JS expressions.
 * Engine is pooled per-thread because GraalVM contexts are not thread-safe.
 */
public class JsLanguage extends LanguageSupport {

    private static final ThreadLocal<ScriptEngine> ENGINE = ThreadLocal.withInitial(() ->
        GraalJSScriptEngine.create(null,
            Context.newBuilder("js")
                .allowExperimentalOptions(true)
                .allowHostAccess(HostAccess.ALL)
                .allowHostClassLookup(className -> true)));

    @Override
    public Predicate createPredicate(String expression) {
        return exchange -> {
            Object result = eval(expression, exchange);
            if (result instanceof Boolean) return (Boolean) result;
            return result != null && !"false".equals(String.valueOf(result));
        };
    }

    @Override
    public Expression createExpression(String expression) {
        return new ExpressionAdapter() {
            @Override
            public Object evaluate(Exchange exchange) {
                return eval(expression, exchange);
            }
        };
    }

    /** Also used directly (outside of Camel routing) by RequestExecutionService to evaluate a
     *  request's Input tab body/header templates. "body" is always bound as the raw (unparsed)
     *  string — so a bare "${body}" always passes it through byte-for-byte; a caller wanting field
     *  access can write "${JSON.parse(body).field}" (GraalJS has JSON built in, no extra plumbing
     *  needed here). "headers" is a plain Java Map, resolved via the same readMember interop as
     *  "vars" below (map.get("X"), no invokeMember), so "${headers.X}" works directly. */
    public static Object evalStandalone(String script, java.util.Map<String, Object> vars, Object body, java.util.Map<String, String> headers) {
        ScriptEngine engine = ENGINE.get();
        engine.put("vars", vars);
        engine.put("body", body);
        engine.put("headers", headers);
        try {
            return engine.eval(script);
        } catch (ScriptException e) {
            throw new RuntimeCamelException("JS evaluation failed: " + e.getMessage(), e);
        }
    }

    private static Object eval(String script, Exchange exchange) {
        ScriptEngine engine = ENGINE.get();
        engine.put("exchange", exchange);

        // body: auto-parse JSON strings so `body` and `body.field` work directly
        Object rawBody = exchange.getMessage().getBody();
        if (rawBody instanceof String) {
            String s = ((String) rawBody).trim();
            if (s.length() > 1 && (s.charAt(0) == '{' || s.charAt(0) == '[')) {
                engine.put("__body__", rawBody);
                try {
                    engine.eval("var body = JSON.parse(__body__);");
                } catch (ScriptException ignored) {
                    engine.put("body", rawBody);
                }
            } else {
                engine.put("body", rawBody);
            }
        } else {
            engine.put("body", rawBody);
        }

        // vars.X → exchange property X via Java Map readMember interop (map.get("X"), no invokeMember)
        engine.put("vars", exchange.getProperties());

        try {
            return engine.eval(script);
        } catch (ScriptException e) {
            throw new RuntimeCamelException("JS evaluation failed: " + e.getMessage(), e);
        }
    }
}
