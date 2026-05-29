import { evalTemplate } from "../engine/expression/simple";

// Thin wrapper kept for callers that only have a `vars` map (not a full
// execution context). Interpolates ${vars.x} / ${variable.x} segments.
export const replaceVars = (str, vars) =>
    evalTemplate(str, { vars: vars || {} });
