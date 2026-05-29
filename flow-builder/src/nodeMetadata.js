//  Shared field helpers (used only by Core node sections) 

const ON_MISMATCH = { key: "onMismatch", label: "On Mismatch", type: "select", options: [
    { value: "stop",     label: "Stop workflow" },
    { value: "continue", label: "Continue" },
]};

const RESULT_VAR = (placeholder = "result") => ({
    key: "resultVar", label: "Store Result In Variable", type: "text", placeholder,
});

const COMPARE_LEFT_FIELDS = (textMode = false) => [
    { key: "leftSource", label: "Source", type: "select", options: [
        { value: "body", label: textMode ? "Body (as string)" : "Body" },
        { value: "variable", label: "Variable" },
        { value: "expression", label: "Expression" },
        { value: "literal", label: textMode ? "Literal Text" : "Literal JSON" },
    ]},
    { key: "leftExpr", label: "Variable Name", type: "text", placeholder: "myVar", showWhen: { key: "leftSource", value: "variable" } },
    { key: "leftExpr", label: "Expression", type: "text", placeholder: "vars.myVar", showWhen: { key: "leftSource", value: "expression" } },
    { key: "leftLiteral", label: textMode ? "Text Value" : "JSON Value", type: "textarea", rows: 3, placeholder: textMode ? "expected text" : '{"key": "value"}', showWhen: { key: "leftSource", value: "literal" } },
];

const COMPARE_RIGHT_FIELDS = (textMode = false) => [
    { key: "rightSource", label: "Source", type: "select", options: [
        { value: "body", label: textMode ? "Body (as string)" : "Body" },
        { value: "variable", label: "Variable" },
        { value: "expression", label: "Expression" },
        { value: "literal", label: textMode ? "Literal Text" : "Literal JSON" },
    ]},
    { key: "rightExpr", label: "Variable Name", type: "text", placeholder: "myVar", showWhen: { key: "rightSource", value: "variable" } },
    { key: "rightExpr", label: "Expression", type: "text", placeholder: "vars.expected", showWhen: { key: "rightSource", value: "expression" } },
    { key: "rightLiteral", label: textMode ? "Text Value" : "JSON Value", type: "textarea", rows: 3, placeholder: textMode ? "expected text" : '{"key": "value"}', showWhen: { key: "rightSource", notValues: ["body", "variable", "expression"] } },
];

//  External node metadata (non-Core groups) 
// Loaded from nodeMetadataExternal.js (mock). Replace with API call when ready 
// see fetchNodeMetadata() in that file.
import { EXTERNAL_NODE_METADATA } from './nodeMetadataExternal';

//  Core node definitions 
//
// Schema per entry:
//   type string node type key
//   label string text shown on the canvas tile
//   icon string emoji shown on the tile
//   nodeClass string CSS class applied to the node div
//   group string sidebar group label (omit to hide from sidebar)
//   sidebarLabel string label shown in the sidebar button
//   width/height number default node dimensions
//   defaultData object initial node.data values
//   zones string[]  which canvas sections this node may be placed in
//                           ("processing" | "processingFailed" | "validation")
//   sections array config panels (omit to keep a custom config component)
//     title string
//     open boolean
//     fields FieldDef[]
//       key string data key
//       label string
//       type       "text"|"password"|"number"|"select"|"checkbox"|"textarea"
//       placeholder string
//       options    [{value, label}]   select only
//       rows number textarea only
//       min number number only
//       showWhen   { key, value }     show when data[key] === value
//                  { key, values }    show when data[key] is in values
//                  { key, notValues}  show when data[key] is NOT in notValues
export const CORE_NODE_METADATA = [
    {
        type: "http", label: "HTTP Outbound", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "HTTP Outbound", width: 58, height: 58, defaultData: { name: "Http Outbound", method: "GET", url: "", headers: "", body: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Request", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "Http Outbound" },
                { key: "method", label: "Method", type: "select", options: [
                    { value: "GET", label: "GET" },
                    { value: "POST", label: "POST" },
                    { value: "PUT", label: "PUT" },
                    { value: "PATCH", label: "PATCH" },
                    { value: "DELETE", label: "DELETE" },
                ]},
                { key: "url", label: "URL", type: "text", placeholder: "https://api.example.com/endpoint" },
            ]},
            { title: "Headers", open: false, fields: [
                { key: "headers", label: "Headers (JSON)", type: "expression", rows: 5, placeholder: '{"Content-Type": "application/json", "Authorization": "Bearer ${vars.token}"}' },
            ]},
            { title: "Body", open: false, fields: [
                { key: "body", label: "Body", type: "expression", rows: 6, placeholder: '{"key": "value", "id": "${vars.orderId}"}' },
            ]},
            { title: "Mock", open: false, fields: [
                { key: "script", label: "Mock Script (used when no URL set)", type: "textarea", rows: 5, placeholder: "{ body: body, headers: headers, vars: vars }" },
            ]},
        ],
    },
    {
        type: "setbody", label: "Set Body", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Set Body", width: 58, height: 58, defaultData: { name: "Set Body", expression: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Body", open: true, fields: [
                { key: "expression", label: "Body Expression", type: "expression", rows: 6, placeholder: "body.result or { id: vars.id }" },
            ]},
        ],
    },
    {
        type: "setvariable", label: "Set Variable", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Set Variable", width: 58, height: 58, defaultData: { name: "Set Variable", entries: [{ name: "", expression: "" }] }, zones: ["processing", "processingFailed"], sections: [
            { title: "Variables", open: true, fields: [
                { key: "entries", label: "Variables", type: "entries",
                  entryFields: [
                    { key: "name", label: "Name", type: "text", placeholder: "myVar" },
                    { key: "expression", label: "Expression", type: "expression", placeholder: "body.value" },
                  ],
                  defaultEntry: { name: "", expression: "" }
                },
            ]},
        ],
    },
    {
        type: "condition", label: "Condition", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Condition", width: 100, height: 100, defaultData: { name: "Condition", script: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Condition", open: true, fields: [
                { key: "conditions", label: "Condition (returns true/false)", type: "expression", rows: 4, placeholder: "vars.status === 'active' && body.count > 0" },
            ]},
        ],
    },
    {
        type: "iteration", label: "Iteration", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Iteration", width: 240, height: 130, defaultData: { name: "Iteration", collection: "", concurrency: 1, placeholder: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Iteration", open: true, fields: [
                { key: "collection", label: "Collection Expression", type: "expression", rows: 2, placeholder: "${body}  or  body.items  or  $[*]" },
                { key: "placeholder", label: "Item Variable Name", type: "text", placeholder: "item  (stores current item in exchangeProperty)" },
                { key: "concurrency", label: "Concurrency", type: "number", placeholder: "1", min: 1 },
            ]},
        ],
    },
    {
        type: "assertion", label: "Assertion", icon: "", nodeClass: "http", group: "Verify", sidebarLabel: "Assertion", width: 58, height: 58, defaultData: { name: "Assertion", logic: "AND", conditions: [], onFail: "stop" }, zones: ["processing", "processingFailed", "validation"], sections: [
            { title: "Assertion", open: true, fields: [
                { key: "logic", label: "Logic", type: "select", options: [
                    { value: "AND", label: "AND - all must pass" },
                    { value: "OR",  label: "OR - any must pass" },
                ]},
                { key: "conditions", label: "Conditions", type: "entries",
                  entryFields: [
                    { key: "left",     label: "Left",     type: "expression", bare: true, placeholder: "body.status" },
                    { key: "operator", label: "Op",       type: "select", options: [
                        { value: "==",       label: "==" },
                        { value: "!=",       label: "!=" },
                        { value: ">",        label: ">"  },
                        { value: ">=",       label: ">=" },
                        { value: "<",        label: "<"  },
                        { value: "<=",       label: "<=" },
                        { value: "contains", label: "contains" },
                        { value: "notNull",  label: "not null" },
                        { value: "typeof",   label: "typeof" },
                    ]},
                    { key: "right", label: "Right", type: "expression", bare: true, placeholder: "200 · string · number · boolean · object" },
                  ],
                  defaultEntry: { left: "", operator: "==", right: "" }
                },
                { key: "onFail", label: "On Failure", type: "select", options: [
                    { value: "stop",     label: "Stop workflow" },
                    { value: "continue", label: "Continue workflow" },
                ]},
            ]},
        ],
    },
    {
        type: "log", label: "Log", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Log", width: 58, height: 58, defaultData: { name: "Log Message" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Log", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "Log Message" },
                { key: "script", label: "Message / Expression", type: "textarea", rows: 4, placeholder: "vars.myVar or 'static text'" },
            ]},
        ],
    },
    {
        type: "wait", label: "Wait", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Wait", width: 58, height: 58, defaultData: { name: "Wait", waitTime: 0 }, zones: ["processing", "processingFailed"], sections: [
            { title: "Wait", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "Wait" },
                { key: "waitTime", label: "Wait Time (ms)", type: "number", placeholder: "1000", min: 0 },
            ]},
        ],
    },
    {
        type: "jsoncompare", label: "JSON Compare", icon: "", nodeClass: "http", group: "Verify", sidebarLabel: "JSON Compare", width: 58, height: 58, defaultData: { name: "JSON Compare", leftSource: "body", rightSource: "literal", mode: "deep-equal", onMismatch: "stop" }, zones: ["processing", "processingFailed", "validation"], sections: [
            { title: "Left Value", open: true, fields: COMPARE_LEFT_FIELDS(false) },
            { title: "Right Value", open: true, fields: COMPARE_RIGHT_FIELDS(false) },
            { title: "Options", open: true, fields: [
                { key: "mode", label: "Compare Mode", type: "select", options: [
                    { value: "deep-equal", label: "Deep Equal exact match" },
                    { value: "partial", label: "Partial left is subset of right" },
                    { value: "keys-only", label: "Keys Only same top-level keys" },
                ]},
                { key: "ignoreArrayOrder", label: "Ignore array element order", type: "checkbox" },
            ]},
            { title: "Output", open: true, fields: [
                RESULT_VAR("compareResult"), ON_MISMATCH,
            ]},
        ],
    },
    {
        type: "dbexecute", label: "SQL Execute", icon: "", nodeClass: "db", group: "Core", sidebarLabel: "SQL Execute", width: 58, height: 58, defaultData: { name: "SQL Execute", queryType: "select" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Connection", open: true, fields: [
                { key: "connectionId", label: "Saved Connection", type: "connection", connectionTypes: ["postgresql", "mysql", "oracle", "sqlserver", "db"] },
                { key: "jdbcUrl", label: "JDBC URL", type: "text", placeholder: "jdbc:postgresql://host:5432/db", showWhen: { key: "connectionId", empty: true } },
                { key: "dbUsername", label: "Username", type: "text", placeholder: "db_user", showWhen: { key: "connectionId", empty: true } },
                { key: "dbPassword", label: "Password", type: "password", placeholder: "", showWhen: { key: "connectionId", empty: true } },
                { key: "driverClass", label: "Driver Class", type: "text", placeholder: "org.postgresql.Driver", showWhen: { key: "connectionId", empty: true } },
            ]},
            { title: "Query", open: true, fields: [
                { key: "queryType", label: "Query Type", type: "select", options: [
                    { value: "select", label: "SELECT" },
                    { value: "insert", label: "INSERT" },
                    { value: "update", label: "UPDATE" },
                    { value: "delete", label: "DELETE" },
                    { value: "ddl", label: "DDL (CREATE / ALTER / DROP)" },
                ]},
                { key: "query", label: "SQL Query", type: "expression", rows: 5, placeholder: "SELECT * FROM orders WHERE id = '${vars.orderId}'" },
                { key: "maxRows", label: "Max Rows (SELECT)", type: "number", placeholder: "1000", min: 1, showWhen: { key: "queryType", value: "select" } },
            ]},
            { title: "Output", open: true, fields: [
                { key: "resultVar", label: "Store Result In Variable", type: "text", placeholder: "queryResult" },
                { key: "setAsBody", label: "Set Result As Body", type: "checkbox" },
            ]},
        ],
    },
    {
        type: "throwerror", label: "Throw Error", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Throw Error", width: 58, height: 58, defaultData: { name: "Throw Error", message: "", errorCode: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Error", open: true, fields: [
                { key: "name",      label: "Node Name",                type: "text",       placeholder: "Throw Error" },
                { key: "message",   label: "Error Message",            type: "expression", rows: 3, placeholder: "Validation failed for ${vars.userId}" },
                { key: "errorCode", label: "Error Code (optional)",    type: "text",       placeholder: "VALIDATION_ERROR" },
            ]},
        ],
    },
    {
        type: "workflowref", label: "Call Workflow", icon: "", nodeClass: "http", group: "Core", sidebarLabel: "Call Workflow", width: 58, height: 58, defaultData: { name: "Call Workflow", workflowId: "" }, zones: ["processing", "processingFailed"], sections: [
            { title: "Workflow", open: true, fields: [
                { key: "name",       label: "Node Name",       type: "text",     placeholder: "Call Workflow" },
                { key: "workflowId", label: "Target Workflow", type: "workflow" },
            ]},
        ],
    },
    {
        type: "textcompare", label: "Text Compare", icon: "", nodeClass: "http", group: "Verify", sidebarLabel: "Text Compare", width: 58, height: 58, defaultData: { name: "Text Compare", leftSource: "body", rightSource: "literal", mode: "exact", caseSensitive: true, onMismatch: "stop" }, zones: ["processing", "processingFailed", "validation"], sections: [
            { title: "Left Value", open: true, fields: COMPARE_LEFT_FIELDS(true) },
            { title: "Right Value", open: true, fields: COMPARE_RIGHT_FIELDS(true) },
            { title: "Options", open: true, fields: [
                { key: "mode", label: "Compare Mode", type: "select", options: [
                    { value: "exact", label: "Exact Match" },
                    { value: "contains", label: "Contains" },
                    { value: "starts-with", label: "Starts With" },
                    { value: "ends-with", label: "Ends With" },
                    { value: "regex", label: "Regex" },
                ]},
                { key: "caseSensitive", label: "Case sensitive", type: "checkbox" },
            ]},
            { title: "Output", open: true, fields: [
                RESULT_VAR("compareResult"), ON_MISMATCH,
            ]},
        ],
    },
];

//  Internal nodes (canvas containers no sidebar entry) 
export const INTERNAL_NODE_METADATA = [
    { type: "errorscope", label: "Error Handler", icon: "", nodeClass: "http", width: 240, height: 130, defaultData: { name: "Error Handler" }, zones: ["processingFailed"], sections: [
        { title: "Settings", open: true, fields: [
            { key: "errorVarPrefix", label: "Error Variable Prefix (optional, default: error)", type: "text", placeholder: "error" },
        ]},
    ]},
    { type: "section", label: "Section", icon: "", nodeClass: "", width: 200, height: 450, defaultData: {} },
    { type: "workflowcontainer", label: "Workflow Container", icon: "", nodeClass: "", width: 760, height: 500, defaultData: {} },
];

//  Merged registry (Core + External + Internal) 
export const NODE_METADATA = [...CORE_NODE_METADATA, ...EXTERNAL_NODE_METADATA, ...INTERNAL_NODE_METADATA];

export const NODE_METADATA_MAP = Object.fromEntries(NODE_METADATA.map((m) => [m.type, m]));

export const SIDEBAR_GROUP_ORDER = [
    "Core",
    "Verify",
    "Local File",
    "SFTP",
    "FTP / FTPS",
    "Cloud Storage",
    "Security",
    "Compression",
    "Notification",
    "Type Converters",
];
