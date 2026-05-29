package com.batchmate.workflow.camel;

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
 * Camel language backed by GraalVM JavaScript.
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
