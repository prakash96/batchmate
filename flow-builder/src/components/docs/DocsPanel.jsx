import { useState } from "react";

const ACCENT = "#3B82F6";
const BG = "#0B1020";
const SIDEBAR_BG = "#080D1A";
const CONTENT_BG = "#0F172A";
const TEXT = "#E2E8F0";
const MUTED = "#64748B";
const BORDER = "rgba(59,130,246,0.12)";
const CODE_BG = "rgba(59,130,246,0.07)";

function Code({ children }) {
  return (
    <code style={{
      display: "inline-block",
      background: CODE_BG,
      border: "1px solid rgba(59,130,246,0.2)",
      borderRadius: 4,
      padding: "1px 7px",
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      color: "#93C5FD",
      lineHeight: 1.5,
    }}>{children}</code>
  );
}

function CodeBlock({ title, children }) {
  return (
    <div style={{ margin: "10px 0" }}>
      {title && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: MUTED,
          textTransform: "uppercase", letterSpacing: "0.09em",
          marginBottom: 4,
        }}>{title}</div>
      )}
      <pre style={{
        background: "#060B18",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        color: "#93C5FD",
        lineHeight: 1.75,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
      }}>{children}</pre>
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{
      background: "rgba(59,130,246,0.07)",
      border: "1px solid rgba(59,130,246,0.22)",
      borderLeft: "3px solid #3B82F6",
      borderRadius: "0 8px 8px 0",
      padding: "10px 14px",
      fontSize: 12,
      color: "#93C5FD",
      margin: "12px 0",
      lineHeight: 1.65,
    }}>{children}</div>
  );
}

function Warn({ children }) {
  return (
    <div style={{
      background: "rgba(245,158,11,0.07)",
      border: "1px solid rgba(245,158,11,0.25)",
      borderLeft: "3px solid #F59E0B",
      borderRadius: "0 8px 8px 0",
      padding: "10px 14px",
      fontSize: 12,
      color: "#FCD34D",
      margin: "12px 0",
      lineHeight: 1.65,
    }}>{children}</div>
  );
}

function P({ children }) {
  return <p style={{ margin: "0 0 10px", fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{children}</p>;
}

function SectionH({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: MUTED,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      margin: "20px 0 8px",
      paddingBottom: 6,
      borderBottom: `1px solid ${BORDER}`,
    }}>{children}</div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
      <span style={{
        color: "#60A5FA", fontSize: 12, minWidth: 110, flexShrink: 0,
        paddingTop: 1, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
      }}>{label}</span>
      <span style={{ color: TEXT, fontSize: 12, flex: 1, lineHeight: 1.65 }}>{children}</span>
    </div>
  );
}

function OpGrid({ pairs }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", margin: "8px 0 12px" }}>
      {pairs.map(([op, desc]) => (
        <div key={op} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <Code>{op}</Code>
          <span style={{ fontSize: 11, color: MUTED }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

// ── Section content ───────────────────────────────────────────────────────────

function ExpressionsContent() {
  return (
    <>
      <P>
        The <Code>{"${...}"}</Code> syntax lets you embed live exchange data into any text field — log messages, body expressions, variable values, and assertion operands.
      </P>

      <SectionH>Body</SectionH>
      <Row label="${body}">The full current message body. After an HTTP call this is the raw response text or JSON string.</Row>
      <CodeBlock title="example — log the response body">{"status ${headers.httpResponseCode}: ${body}"}</CodeBlock>

      <SectionH>Headers</SectionH>
      <P>
        After an <strong>HTTP Outbound</strong> node, all response headers are available. The Camel-prefixed originals (e.g. <Code>CamelHttpResponseCode</Code>) are automatically mirrored to short names.
      </P>
      <Row label="${headers.httpResponseCode}">HTTP status code integer — 200, 404, 500 …</Row>
      <Row label="${headers.httpResponseText}">HTTP reason phrase — OK, Not Found …</Row>
      <Row label="${headers.content-type}">Any response header by its lowercase name.</Row>
      <CodeBlock title="example — log status and text">{"[${headers.httpResponseCode}] ${headers.httpResponseText} — ${body}"}</CodeBlock>
      <Note>
        Use the short form <Code>httpResponseCode</Code> rather than <Code>CamelHttpResponseCode</Code>. Both resolve correctly, but the short form is cleaner and consistent across all nodes.
      </Note>

      <SectionH>Variables</SectionH>
      <P>Variables are workflow-scoped values written by a <strong>Set Variable</strong> node and readable in every downstream node.</P>
      <Row label="${vars.name}">Read the variable named <Code>name</Code>.</Row>
      <CodeBlock title="example — reference a saved token">{"Authorization: Bearer ${vars.authToken}"}</CodeBlock>

      <SectionH>Combining expressions</SectionH>
      <P>Multiple expressions can be mixed freely in a single string:</P>
      <CodeBlock>{"user=${vars.userId} status=${headers.httpResponseCode} body=${body}"}</CodeBlock>
    </>
  );
}

function HttpContent() {
  return (
    <>
      <P>Sends an outbound HTTP or HTTPS request and replaces the current message body with the response payload.</P>

      <SectionH>Request fields</SectionH>
      <Row label="Method">GET · POST · PUT · PATCH · DELETE</Row>
      <Row label="URL">Full URL including scheme. Query parameters can be appended directly, e.g. <Code>https://api.example.com/users?active=true</Code></Row>
      <Row label="Headers">A JSON object where keys are header names and values are strings. Evaluated before the request is sent.</Row>
      <Row label="Body">Request payload — used for POST / PUT / PATCH. Leave empty for GET / DELETE.</Row>

      <SectionH>Request headers format</SectionH>
      <CodeBlock title="example">{'{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer ${vars.token}",\n  "X-Correlation-Id": "abc-123"\n}'}</CodeBlock>
      <Note>
        Header values are plain strings. To include a dynamic value, embed a <Code>{"${vars.name}"}</Code> expression inside the string value (as shown above for Authorization).
      </Note>

      <SectionH>After the request</SectionH>
      <P>The exchange is updated with the HTTP response before the next node runs:</P>
      <Row label="${body}">Full response body (string). Parse JSON downstream with Set Body or an Assertion.</Row>
      <Row label="${headers.httpResponseCode}">Integer HTTP status code.</Row>
      <Row label="${headers.httpResponseText}">Status reason phrase.</Row>
      <CodeBlock title="log node after an HTTP call">{"GET ${headers.httpResponseCode} (${headers.httpResponseText})\n${body}"}</CodeBlock>

      <SectionH>Handling errors</SectionH>
      <Warn>
        A non-2xx status does <strong>not</strong> automatically stop the workflow. Add an <strong>Assertion</strong> node immediately after the HTTP call and assert <Code>httpResponseCode == 200</Code> (or the expected code) with <em>on fail: stop</em>.
      </Warn>
    </>
  );
}

function SetBodyContent() {
  return (
    <>
      <P>Replaces the current message body with a new value. Use this to build a request payload before an HTTP POST or to reshape a response for downstream nodes.</P>

      <SectionH>Expression field</SectionH>
      <Row label="Literal">Plain text or raw JSON. No <Code>{"${}"}</Code> needed — typed verbatim.</Row>
      <Row label="Dynamic">Any <Code>{"${...}"}</Code> expression — body, headers, vars, or a template mixing all three.</Row>

      <SectionH>Examples</SectionH>
      <CodeBlock title="static JSON payload">{'{"action": "start", "id": 42}'}</CodeBlock>
      <CodeBlock title="wrap the current body">{'{"data": ${body}, "status": "ok"}'}</CodeBlock>
      <CodeBlock title="build from variables">{'{"userId": ${vars.userId}, "token": "${vars.token}"}'}</CodeBlock>
      <CodeBlock title="pass through unchanged">{"${body}"}</CodeBlock>
      <Note>Leaving the expression empty is equivalent to <Code>{"${body}"}</Code> — the body passes through unchanged.</Note>
    </>
  );
}

function SetVariableContent() {
  return (
    <>
      <P>
        Stores one or more named values in workflow scope. Variables persist for the entire run and are readable in every downstream node using <Code>{"${vars.name}"}</Code>.
      </P>

      <SectionH>Fields</SectionH>
      <Row label="Name">Variable name — alphanumeric with underscores, no spaces. E.g. <Code>userId</Code>, <Code>auth_token</Code>.</Row>
      <Row label="Expression">Value to store — a literal, an expression, or a combination.</Row>

      <SectionH>Common patterns</SectionH>
      <CodeBlock title="capture the HTTP response body">{"name:  payload\nexpr:  ${body}"}</CodeBlock>
      <CodeBlock title="save the status code">{"name:  statusCode\nexpr:  ${headers.httpResponseCode}"}</CodeBlock>
      <CodeBlock title="save a literal">{"name:  environment\nexpr:  production"}</CodeBlock>
      <CodeBlock title="derive from another variable">{"name:  greeting\nexpr:  Hello ${vars.userName}"}</CodeBlock>

      <SectionH>Reading variables downstream</SectionH>
      <P>Use <Code>{"${vars.name}"}</Code> in any subsequent Log, Assertion, Set Body, or HTTP node.</P>
      <CodeBlock>{"// Log node — after saving 'payload'\nReceived: ${vars.payload}"}</CodeBlock>
      <Note>Multiple variable entries can be added in a single Set Variable node. They are set in order, so later entries can reference earlier ones from the same node.</Note>
    </>
  );
}

function LogContent() {
  return (
    <>
      <P>Writes a formatted message to the workflow execution log. All entries appear in the Run Detail view under run history. Logging does not affect the exchange — it is purely observational.</P>

      <SectionH>Script field</SectionH>
      <P>A free-form text template. Supports all <Code>{"${...}"}</Code> expressions — body, headers, and vars.</P>

      <SectionH>Examples</SectionH>
      <CodeBlock title="log HTTP response status and body">{"[${headers.httpResponseCode}] ${body}"}</CodeBlock>
      <CodeBlock title="log multiple variables">{"userId=${vars.userId} env=${vars.environment} token=${vars.authToken}"}</CodeBlock>
      <CodeBlock title="structured trace line">{"step=fetchUser status=${headers.httpResponseCode} result=${vars.payload}"}</CodeBlock>

      <Note>Log nodes are safe to add anywhere during development and have zero effect on workflow data or routing.</Note>
    </>
  );
}

function AssertionContent() {
  return (
    <>
      <P>Validates one or more conditions at runtime. Use it to enforce that an HTTP call succeeded, a response contains expected data, or a variable meets a requirement before continuing.</P>

      <SectionH>Condition sources</SectionH>
      <Row label="body">The current message body (treated as a string).</Row>
      <Row label="variable">A workflow variable — type the variable name (without <Code>{"${vars.}"}</Code>).</Row>
      <Row label="literal">A fixed value typed inline — a number, string, or JSON fragment.</Row>

      <SectionH>Operators</SectionH>
      <OpGrid pairs={[
        ["==",       "equals"],
        ["!=",       "not equals"],
        [">",        "greater than"],
        [">=",       "greater or equal"],
        ["<",        "less than"],
        ["<=",       "less or equal"],
        ["contains", "body / string contains substring"],
        ["notNull",  "value is not null or undefined"],
      ]} />

      <SectionH>On fail</SectionH>
      <Row label="stop">Throws an error and halts the workflow immediately. Use for hard requirements.</Row>
      <Row label="continue">Sets <Code>{"${vars._assertionFailed}"}</Code> to <Code>true</Code> and continues. Use when you want to branch on failure further downstream.</Row>

      <SectionH>Logic (multiple conditions)</SectionH>
      <Row label="AND">All conditions must pass.</Row>
      <Row label="OR">At least one condition must pass.</Row>

      <SectionH>Examples</SectionH>
      <CodeBlock title="assert HTTP 200 — hard stop">{"left:    headers   (source) → httpResponseCode\nop:      ==\nright:   literal   → 200\non fail: stop"}</CodeBlock>
      <CodeBlock title="assert body contains a key — hard stop">{"left:    body\nop:      contains\nright:   literal   → \"id\"\non fail: stop"}</CodeBlock>
      <CodeBlock title="assert variable is set">{"left:    variable  → authToken\nop:      notNull\non fail: stop"}</CodeBlock>
      <CodeBlock title="soft check — branch downstream">{"left:    variable  → statusCode\nop:      ==\nright:   literal   → 200\non fail: continue\n\n// downstream: check ${vars._assertionFailed}"}</CodeBlock>
    </>
  );
}

function WaitContent() {
  return (
    <>
      <P>Pauses the workflow for a fixed duration. Useful for rate-limiting calls to external APIs, introducing a delay before a retry, or pacing a polling loop.</P>
      <SectionH>Field</SectionH>
      <Row label="Wait time">Duration in <strong>milliseconds</strong>.</Row>
      <CodeBlock title="common values">{"500   →  0.5 seconds\n1000  →  1 second\n5000  →  5 seconds\n60000 →  1 minute"}</CodeBlock>
      <Warn>Long waits block the Camel thread. For polling patterns prefer a short wait (1–2 s) inside an iteration node rather than one long wait.</Warn>
    </>
  );
}

function ThrowErrorContent() {
  return (
    <>
      <P>
        Immediately halts the current workflow with a runtime error. If a <strong>processingFailed</strong> section exists, the error is caught there and a set of error variables is populated automatically.
      </P>

      <SectionH>Fields</SectionH>
      <Row label="Error Message">The error text. Supports <Code>{"${vars.X}"}</Code> and <Code>{"${headers.X}"}</Code> expressions — the value is evaluated at runtime before the error is thrown.</Row>
      <Row label="Error Code">An optional short string tag identifying the error category (e.g. <Code>VALIDATION_ERROR</Code>, <Code>NOT_FOUND</Code>). Available as <Code>{"${vars.errorCode}"}</Code> in the processingFailed section.</Row>

      <SectionH>Error attributes in processingFailed</SectionH>
      <P>
        When the error is caught, the following exchange properties are set using the <strong>Error Variable Prefix</strong> configured on the Error Scope node (default: <Code>error</Code>).
      </P>
      <Row label="${vars.errorMessage}">The error message text exactly as passed to Throw Error.</Row>
      <Row label="${vars.errorCode}">The Error Code string, or empty if none was set.</Row>
      <Row label="${vars.errorType}">The fully-qualified Java exception class name (e.g. <Code>org.graalvm.polyglot.PolyglotException</Code>).</Row>
      <Row label="${vars.errorStackTrace}">The full Java stack trace string. Useful for logging; avoid exposing externally.</Row>
      <Note>
        If your Error Scope node uses a custom prefix (e.g. <Code>err</Code>), replace <Code>error</Code> with that prefix — so <Code>{"${vars.errMessage}"}</Code>, <Code>{"${vars.errCode}"}</Code>, etc.
      </Note>

      <SectionH>Examples</SectionH>
      <CodeBlock title="hard stop with a static message">{"message: Unexpected response from upstream\nerrorCode: UPSTREAM_ERROR"}</CodeBlock>
      <CodeBlock title="dynamic message using variables">{"message: Validation failed for user ${vars.userId}\nerrorCode: VALIDATION_ERROR"}</CodeBlock>
      <CodeBlock title="log the error in processingFailed (Log node)">{"[${vars.errorCode}] ${vars.errorMessage}"}</CodeBlock>
      <CodeBlock title="conditional handling in processingFailed (Condition node)">{"vars.errorCode === 'VALIDATION_ERROR'"}</CodeBlock>

      <SectionH>Error Scope prefix</SectionH>
      <P>
        The Error Scope node in the processingFailed section controls the variable prefix. Change it to avoid name collisions if needed.
      </P>
      <Row label="Default (error)">{"${vars.errorMessage}, ${vars.errorCode}, ${vars.errorType}, ${vars.errorStackTrace}"}</Row>
      <Row label="Custom (e.g. err)">{"${vars.errMessage}, ${vars.errCode}, ${vars.errType}, ${vars.errStackTrace}"}</Row>

      <Warn>
        Throw Error always stops the processing section. If there is no processingFailed section the workflow simply fails. Add a processingFailed section with at least a Log node to capture and report errors gracefully.
      </Warn>
    </>
  );
}

function JsonCompareContent() {
  return (
    <>
      <P>Compares two JSON values and optionally stores the pass/fail result in a variable. Useful for schema validation, regression checks, or verifying API responses.</P>

      <SectionH>Modes</SectionH>
      <Row label="deep-equal">Both values must be structurally identical — same keys, same values, same nesting.</Row>
      <Row label="partial">Every key in the <em>right</em> value must exist and match in the <em>left</em> value. Extra keys on the left are ignored.</Row>
      <Row label="keys-only">Both objects must have exactly the same set of top-level keys regardless of their values.</Row>

      <SectionH>Sources</SectionH>
      <Row label="body">Current message body — parsed as JSON automatically.</Row>
      <Row label="variable">A workflow variable containing a JSON string.</Row>
      <Row label="literal">Inline JSON typed directly into the field.</Row>

      <SectionH>Options</SectionH>
      <Row label="Ignore array order">When enabled, arrays are compared as sets (order ignored).</Row>
      <Row label="Result variable">Variable name to receive <Code>true</Code> or <Code>false</Code>. Leave blank to discard.</Row>
      <Row label="On mismatch">stop — halt; continue — set result variable and carry on.</Row>

      <SectionH>Example</SectionH>
      <CodeBlock title="partial match — verify response shape">{'left:    body   (source)\nmode:    partial\nright:   literal →\n{\n  "id": 1,\n  "active": true\n}\nresult:  matchResult\non fail: continue\n\n// Log: match=${vars.matchResult}'}</CodeBlock>
    </>
  );
}

function TextCompareContent() {
  return (
    <>
      <P>Compares two string values using a variety of match modes. Works on body text, variables, or literals.</P>

      <SectionH>Modes</SectionH>
      <Row label="exact">Full string equality — left must equal right exactly.</Row>
      <Row label="contains">Left string must contain the right value as a substring.</Row>
      <Row label="starts-with">Left must start with the right value.</Row>
      <Row label="ends-with">Left must end with the right value.</Row>
      <Row label="regex">Left must match the regular expression provided as the right value.</Row>

      <SectionH>Options</SectionH>
      <Row label="Case sensitive">Toggle off for case-insensitive matching (all modes). For regex, add <Code>(?i)</Code> inside the pattern instead.</Row>
      <Row label="Result variable">Variable name to receive <Code>true</Code> or <Code>false</Code>.</Row>
      <Row label="On mismatch">stop — halt; continue — set result variable and carry on.</Row>

      <SectionH>Examples</SectionH>
      <CodeBlock title="check body contains success">{"left:    body\nmode:    contains\nright:   literal → success\nresult:  isOk\non fail: continue\n\n// Log: ok=${vars.isOk}"}</CodeBlock>
      <CodeBlock title="regex — check UUID format">{"left:    variable → correlationId\nmode:    regex\nright:   literal → ^[0-9a-f-]{36}$\non fail: stop"}</CodeBlock>
    </>
  );
}

// ── Section registry ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "expressions",
    label: "Expressions & Variables",
    tag: "Reference",
    color: "#A78BFA",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 2.5 L1.5 8 L4 13.5"/><path d="M12 2.5 L14.5 8 L12 13.5"/>
        <line x1="6" y1="8" x2="10" y2="8"/>
      </svg>
    ),
    Content: ExpressionsContent,
  },
  {
    id: "http",
    label: "HTTP Outbound",
    tag: "Core",
    color: "#3B82F6",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5"/>
        <path d="M1.5 8 Q4 5 8 8 Q12 11 14.5 8"/>
        <line x1="8" y1="1.5" x2="8" y2="14.5"/>
      </svg>
    ),
    Content: HttpContent,
  },
  {
    id: "setbody",
    label: "Set Body",
    tag: "Core",
    color: "#10B981",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2" y="3" width="12" height="10" rx="2"/>
        <line x1="5" y1="7" x2="11" y2="7"/>
        <line x1="5" y1="10" x2="8.5" y2="10"/>
      </svg>
    ),
    Content: SetBodyContent,
  },
  {
    id: "setvariable",
    label: "Set Variable",
    tag: "Core",
    color: "#F59E0B",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="1.5" y="4" width="9" height="8" rx="1.5"/>
        <line x1="12" y1="6.5" x2="14.5" y2="6.5"/><line x1="12" y1="9.5" x2="14.5" y2="9.5"/>
      </svg>
    ),
    Content: SetVariableContent,
  },
  {
    id: "log",
    label: "Log",
    tag: "Core",
    color: "#06B6D4",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2" y="2" width="12" height="12" rx="2"/>
        <line x1="5" y1="6" x2="11" y2="6"/>
        <line x1="5" y1="8.5" x2="11" y2="8.5"/>
        <line x1="5" y1="11" x2="8" y2="11"/>
      </svg>
    ),
    Content: LogContent,
  },
  {
    id: "assertion",
    label: "Assertion",
    tag: "Verify",
    color: "#8B5CF6",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M8 1.5 L2.5 4 L2.5 8.5 C2.5 11.5 5 13.5 8 14.5 C11 13.5 13.5 11.5 13.5 8.5 L13.5 4 Z"/>
        <polyline points="5.5,8 7,9.5 10.5,6"/>
      </svg>
    ),
    Content: AssertionContent,
  },
  {
    id: "wait",
    label: "Wait",
    tag: "Core",
    color: "#64748B",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5"/>
        <polyline points="8,4 8,8 10.5,10"/>
      </svg>
    ),
    Content: WaitContent,
  },
  {
    id: "throwerror",
    label: "Throw Error",
    tag: "Core",
    color: "#EF4444",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.5 L14.5 13.5 L1.5 13.5 Z"/>
        <line x1="8" y1="6" x2="8" y2="9.5"/>
        <circle cx="8" cy="11.5" r="0.6" fill="currentColor"/>
      </svg>
    ),
    Content: ThrowErrorContent,
  },
  {
    id: "jsoncompare",
    label: "JSON Compare",
    tag: "Verify",
    color: "#EC4899",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M3 2 Q1.5 2 1.5 3.5 L1.5 5 Q1.5 6 0 6 Q1.5 6 1.5 7 L1.5 8.5 Q1.5 10 3 10"/>
        <path d="M13 2 Q14.5 2 14.5 3.5 L14.5 5 Q14.5 6 16 6 Q14.5 6 14.5 7 L14.5 8.5 Q14.5 10 13 10"/>
        <line x1="5.5" y1="6" x2="10.5" y2="6"/>
      </svg>
    ),
    Content: JsonCompareContent,
  },
  {
    id: "textcompare",
    label: "Text Compare",
    tag: "Verify",
    color: "#F97316",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="2" y1="4.5" x2="10" y2="4.5"/>
        <line x1="2" y1="8" x2="14" y2="8"/>
        <line x1="2" y1="11.5" x2="7" y2="11.5"/>
      </svg>
    ),
    Content: TextCompareContent,
  },
];

const TAG_COLORS = {
  Reference: "#A78BFA",
  Core:      "#3B82F6",
  Verify:    "#8B5CF6",
};

// ── Main panel ────────────────────────────────────────────────────────────────

export default function DocsPanel({ onClose }) {
  const [activeId, setActiveId] = useState("expressions");
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? SECTIONS.filter(s => s.label.toLowerCase().includes(search.toLowerCase()) || s.tag.toLowerCase().includes(search.toLowerCase()))
    : SECTIONS;

  const active = SECTIONS.find(s => s.id === activeId) || SECTIONS[0];
  const ActiveContent = active.Content;

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
      background: BG,
      overflow: "hidden",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 48,
        background: SIDEBAR_BG,
        borderBottom: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 14,
        flexShrink: 0,
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="#A78BFA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2.5 C7 1 4 1 2 1.5 L2 14 C4 13.5 7 13.5 9 15"/>
            <path d="M9 2.5 C11 1 14 1 16 1.5 L16 14 C14 13.5 11 13.5 9 15"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, letterSpacing: "0.04em" }}>Documentation</span>
          <span style={{ fontSize: 10, color: "#A78BFA", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "1px 7px", fontWeight: 700, letterSpacing: "0.06em" }}>CORE &amp; VERIFY</span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 320, position: "relative" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="5" cy="5" r="4"/><line x1="8.5" y1="8.5" x2="11" y2="11"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search topics…"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${BORDER}`,
              borderRadius: 7,
              color: TEXT,
              fontSize: 12,
              padding: "6px 10px 6px 28px",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "'Inter', sans-serif",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(59,130,246,0.5)"}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
        </div>

        <span style={{ flex: 1 }} />
        {onClose && (
          <button
            onClick={onClose}
            title="Close documentation"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: MUTED, cursor: "pointer", borderRadius: 7,
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, lineHeight: 1, transition: "all 0.12s", flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.color = "#EF4444"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = MUTED; }}
          >×</button>
        )}
      </div>

      {/* ── Body: nav + content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left nav */}
        <div style={{
          width: 220,
          flexShrink: 0,
          background: SIDEBAR_BG,
          borderRight: `1px solid ${BORDER}`,
          overflowY: "auto",
          padding: "12px 0",
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: "24px 16px", color: MUTED, fontSize: 12, textAlign: "center" }}>
              No topics match "{search}"
            </div>
          )}

          {/* Group by tag */}
          {["Reference", "Core", "Verify"].map(tag => {
            const items = filtered.filter(s => s.tag === tag);
            if (items.length === 0) return null;
            return (
              <div key={tag} style={{ marginBottom: 6 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: TAG_COLORS[tag],
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  padding: "6px 16px 4px",
                  opacity: 0.7,
                }}>{tag}</div>
                {items.map(({ id, label, color, icon }) => {
                  const isActive = id === activeId;
                  return (
                    <button
                      key={id}
                      onClick={() => { setActiveId(id); setSearch(""); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 16px",
                        background: isActive ? `${color}15` : "transparent",
                        borderLeft: isActive ? `2px solid ${color}` : "2px solid transparent",
                        border: "none", borderLeft: isActive ? `2px solid ${color}` : "2px solid transparent",
                        cursor: "pointer", textAlign: "left",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ color: isActive ? color : MUTED, flexShrink: 0 }}>{icon}</span>
                      <span style={{
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: isActive ? color : "#CBD5E1",
                      }}>{label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto", background: CONTENT_BG }}>
          <div style={{ maxWidth: 760, padding: "32px 40px", margin: "0 auto" }}>

            {/* Content header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${active.color}18`,
                border: `1px solid ${active.color}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: active.color,
                flexShrink: 0,
              }}>{active.icon}</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>{active.label}</h1>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: TAG_COLORS[active.tag],
                  background: `${TAG_COLORS[active.tag]}18`,
                  border: `1px solid ${TAG_COLORS[active.tag]}40`,
                  borderRadius: 4, padding: "1px 7px",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{active.tag}</span>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 24 }}>
              <ActiveContent />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
