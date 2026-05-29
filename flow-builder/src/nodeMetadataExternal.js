export const EXTERNAL_NODE_METADATA = [

    // ── Compression ───────────────────────────────────────────────────────────
    {
        type: "gzipcompress", label: "GZIP Compress", icon: "", nodeClass: "http", group: "Compression", sidebarLabel: "GZIP Compress", width: 58, height: 58,
        defaultData: { name: "GZIP Compress" }, zones: ["processing", "processingFailed"],
        sections: [
            { title: "GZIP Compress", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "GZIP Compress" },
            ]},
        ],
    },
    {
        type: "gzipdecompress", label: "GZIP Decompress", icon: "", nodeClass: "http", group: "Compression", sidebarLabel: "GZIP Decompress", width: 58, height: 58,
        defaultData: { name: "GZIP Decompress" }, zones: ["processing", "processingFailed"],
        sections: [
            { title: "GZIP Decompress", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "GZIP Decompress" },
            ]},
        ],
    },
    {
        type: "gzipextract", label: "GZIP Extract", icon: "", nodeClass: "http", group: "Compression", sidebarLabel: "GZIP Extract", width: 58, height: 58,
        defaultData: { name: "GZIP Extract" }, zones: ["processing", "processingFailed"],
        sections: [
            { title: "GZIP Extract", open: true, fields: [
                { key: "name", label: "Node Name", type: "text", placeholder: "GZIP Extract" },
            ]},
        ],
    },
    {
        type: "base64encode", label: "Base64 Encode", icon: "", nodeClass: "http", group: "Compression", sidebarLabel: "Base64 Encode", width: 58, height: 58,
        defaultData: { name: "Base64 Encode", source: "body", setAsBody: true }, zones: ["processing", "processingFailed"],
        sections: [
            { title: "Input", open: true, fields: [
                { key: "name",      label: "Node Name",                    type: "text",     placeholder: "Base64 Encode" },
                { key: "source",    label: "Source",                       type: "select",   options: [{ value: "body", label: "Body" }, { value: "variable", label: "Variable" }, { value: "literal", label: "Literal" }] },
                { key: "sourceVar", label: "Variable Name",                type: "text",     placeholder: "myVar", showWhen: { key: "source", value: "variable" } },
                { key: "sourceLiteral", label: "Literal Value",            type: "textarea", rows: 3, showWhen: { key: "source", value: "literal" } },
            ]},
            { title: "Output", open: true, fields: [
                { key: "resultVar", label: "Store Result In Variable",     type: "text",     placeholder: "encodedResult" },
                { key: "setAsBody", label: "Set Result As Body",           type: "checkbox" },
            ]},
        ],
    },
    {
        type: "base64decode", label: "Base64 Decode", icon: "", nodeClass: "http", group: "Compression", sidebarLabel: "Base64 Decode", width: 58, height: 58,
        defaultData: { name: "Base64 Decode", source: "body", outputEncoding: "utf8", setAsBody: true }, zones: ["processing", "processingFailed"],
        sections: [
            { title: "Input", open: true, fields: [
                { key: "name",      label: "Node Name",                    type: "text",     placeholder: "Base64 Decode" },
                { key: "source",    label: "Source",                       type: "select",   options: [{ value: "body", label: "Body" }, { value: "variable", label: "Variable" }, { value: "literal", label: "Literal" }] },
                { key: "sourceVar", label: "Variable Name",                type: "text",     placeholder: "myVar", showWhen: { key: "source", value: "variable" } },
                { key: "sourceLiteral", label: "Literal Value",            type: "textarea", rows: 3, showWhen: { key: "source", value: "literal" } },
            ]},
            { title: "Output", open: true, fields: [
                { key: "outputEncoding", label: "Output Encoding", type: "select", options: [{ value: "utf8", label: "UTF-8 String" }, { value: "binary", label: "Binary (byte[])" }] },
                { key: "resultVar", label: "Store Result In Variable",     type: "text",     placeholder: "decodedResult" },
                { key: "setAsBody", label: "Set Result As Body",           type: "checkbox" },
            ]},
        ],
    },
];

export const CONNECTION_TYPE_METADATA = {};
