/*
 * JavaScript expression evaluator.
 * Expressions are plain JavaScript evaluated with the workflow context in scope.
 *
 * Available variables inside expressions:
 *   body / payload       the current exchange body (body is primary)
 *   headers              the headers object
 *   vars / variables     the exchange variables map
 *
 * Entry points:
 *   evalSimple(expr, ctx)     -> raw value
 *   evalPredicate(expr, ctx)  -> boolean
 *   evalTemplate(tpl, ctx)    -> string with ${...} interpolated
 *
 * ctx shape: { body, headers, vars }
 */

function buildArgs(ctx) {
    const c = ctx || {};
    return {
        body:      c.body,
        payload:   c.body,
        headers:   c.headers   ?? {},
        vars:      c.vars      ?? {},
        variables: c.vars      ?? {},
    };
}

function runExpr(expr, ctx) {
    const { payload, body, headers, vars, variables } = buildArgs(ctx);
    // eslint-disable-next-line no-new-func
    return new Function("payload", "body", "headers", "vars", "variables", `return (${expr})`)(
        payload, body, headers, vars, variables
    );
}

/** Evaluate a JavaScript expression and return the raw value. */
export function evalSimple(expr, ctx) {
    if (expr == null || expr === "") return undefined;
    try {
        return runExpr(String(expr).trim(), ctx);
    } catch {
        return undefined;
    }
}

/** Evaluate a JavaScript expression as a predicate (returns boolean). */
export function evalPredicate(expr, ctx) {
    const v = evalSimple(expr, ctx);
    if (v == null) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
    if (typeof v === "string") return v !== "" && v !== "false" && v !== "0";
    return true;
}

/** Interpolate ${...} segments in a template string against the context. */
export function evalTemplate(template, ctx) {
    if (template == null) return template;
    return String(template).replace(/\$\{([^}]*)\}/g, (_, expr) => {
        try {
            const v = runExpr(expr.trim(), ctx);
            if (v == null) return "";
            if (typeof v === "object") return JSON.stringify(v);
            return String(v);
        } catch {
            return "";
        }
    });
}
