import { getSectionForPosition, getAbsolutePosition } from "../utils/sectionRules";

const NON_EXECUTABLE = new Set(["section", "workflowcontainer", "errorscope", "iteration"]);
const SECTION_LABELS = { processing: "Processing", processingFailed: "Processing Failed" };

const VALIDATORS = {
    workflowref: (data) => {
        if (!data.workflowId?.trim()) return ["Target workflow is required"];
        return [];
    },
    http: (data) => {
        const e = [];
        if (!(data.url ?? data.request?.url)) e.push("URL is required");
        return e;
    },
    setbody: (data) => {
        const e = [];
        if (!data.expression?.trim()) e.push("Expression is required");
        return e;
    },
    setvariable: (data) => {
        const entries = data.entries || [];
        if (!entries.length || entries.every(en => !en.name?.trim()))
            return ["At least one variable name is required"];
        return [];
    },
    condition: (data) => {
        if (!data.conditions?.length) return ["No conditions defined"];
        return [];
    },
    assertion: (data) => {
        if (!data.conditions?.length) return ["No assertion conditions defined"];
        return [];
    },
    dbexecute: (data) => {
        const e = [];
        if (!data.connectionId && !data.jdbcUrl?.trim()) e.push("Database connection or JDBC URL is required");
        if (!data.query?.trim()) e.push("SQL query is required");
        return e;
    },
    smtp: (data) => {
        const e = [];
        if (!data.to?.trim()) e.push("'To' address is required");
        if (!data.smtpHost?.trim()) e.push("SMTP host is required");
        if (!data.subject?.trim()) e.push("Subject is required");
        return e;
    },
    slack: (data) => {
        const e = [];
        if (!data.slackWebhookUrl?.trim()) e.push("Slack webhook URL is required");
        if (!data.slackMessage?.trim()) e.push("Message is required");
        return e;
    },
    teams: (data) => {
        const e = [];
        if (!data.teamsWebhookUrl?.trim()) e.push("Teams webhook URL is required");
        if (!data.teamsMessage?.trim()) e.push("Message is required");
        return e;
    },
    webhook: (data) => {
        const e = [];
        if (!data.webhookUrl?.trim()) e.push("Webhook URL is required");
        return e;
    },
    fileread: (data) => (!data.filePath?.trim() ? ["File path is required"] : []),
    filewrite: (data) => {
        const e = [];
        if (!data.directory?.trim()) e.push("Directory is required");
        return e;
    },
    fileappend: (data) => (!data.filePath?.trim() ? ["File path is required"] : []),
    filedelete: (data) => (!data.filePath?.trim() ? ["File path is required"] : []),
    filemove: (data) => {
        const e = [];
        if (!data.sourcePath?.trim()) e.push("Source path is required");
        if (!data.destPath?.trim()) e.push("Destination path is required");
        return e;
    },
    fileexists: (data) => (!data.filePath?.trim() ? ["File path is required"] : []),
    jsonconfig: (data) => (!data.filePath?.trim() ? ["File path is required"] : []),
    sftpread: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remoteDirectory?.trim()) e.push("Remote directory is required");
        return e;
    },
    sftpwrite: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remoteDirectory?.trim()) e.push("Remote directory is required");
        return e;
    },
    sftpdelete: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remoteFilePath?.trim()) e.push("Remote file path is required");
        return e;
    },
    sftpmove: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.sourcePath?.trim()) e.push("Source path is required");
        if (!data.destinationPath?.trim()) e.push("Destination path is required");
        return e;
    },
    sftpexists: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remotePath?.trim()) e.push("Remote path is required");
        return e;
    },
    sftplist: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remotePath?.trim()) e.push("Remote path is required");
        return e;
    },
    ftpread: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remoteDirectory?.trim()) e.push("Remote directory is required");
        return e;
    },
    ftpwrite: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remoteDirectory?.trim()) e.push("Remote directory is required");
        return e;
    },
    ftpexists: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remotePath?.trim()) e.push("Remote path is required");
        return e;
    },
    ftplist: (data) => {
        const e = [];
        if (!data.connectionId && !data.host?.trim()) e.push("Host is required");
        if (!data.remotePath?.trim()) e.push("Remote path is required");
        return e;
    },
    s3read: (data) => {
        const e = [];
        if (!data.bucket?.trim()) e.push("Bucket is required");
        if (!data.key?.trim()) e.push("Key is required");
        return e;
    },
    s3write: (data) => {
        const e = [];
        if (!data.bucket?.trim()) e.push("Bucket is required");
        if (!data.key?.trim()) e.push("Key is required");
        return e;
    },
    pgpencrypt: (data) => {
        const src = data.recipientKeySource;
        const missing =
            (src === "file" && !data.recipientKeyFile?.trim()) ||
            (src === "inline" && !data.recipientKeyInline?.trim()) ||
            (src === "variable" && !data.recipientKeyVariable?.trim()) ||
            (src === "vault" && !data.recipientKeyVault?.trim()) ||
            (!src && !data.publicKey?.trim());
        return missing ? ["Public key is required"] : [];
    },
    pgpdecrypt: (data) => {
        const src = data.privateKeySource;
        const missing =
            (src === "file" && !data.privateKeyFile?.trim()) ||
            (src === "inline" && !data.privateKeyInline?.trim()) ||
            (src === "variable" && !data.privateKeyVariable?.trim()) ||
            (src === "vault" && !data.privateKeyVault?.trim()) ||
            (!src && !data.privateKey?.trim());
        return missing ? ["Private key is required"] : [];
    },
    zipcompress: (data) => (!data.outputPath?.trim() ? ["Output path is required"] : []),
    zipextract: (data) => (!data.zipPath?.trim() ? ["ZIP file path is required"] : []),
};

export function validateWorkflow(nodes, edges = [], connections = []) {
    const issues = [];

    //  Per-node config validation 
    for (const node of nodes) {
        if (NON_EXECUTABLE.has(node.type)) continue;

        const validate = VALIDATORS[node.type];
        if (!validate) continue;

        const errors = validate(node.data || {});
        if (errors.length) {
            issues.push({
                nodeId: node.id,
                nodeName: node.data?.name || node.type,
                nodeType: node.type,
                errors,
            });
        }
    }

    //  Multiple start nodes per section 
    // Top-level nodes only: parented to workflowcontainer (or no parent).
    // Nodes inside iterations have their own sub-graph  skip them.
    const containerId = nodes.find(n => n.type === "workflowcontainer")?.id;
    const iterationIds = new Set(nodes.filter(n => n.type === "iteration").map(n => n.id));

    const topLevel = nodes.filter(n =>
        !NON_EXECUTABLE.has(n.type) &&
        (!n.parentId || n.parentId === containerId) &&
        !iterationIds.has(n.parentId)
    );

    const targetIds = new Set(edges.map(e => e.target));

    // Group start nodes (no incoming edge) by section
    const startsBySection = {};
    for (const node of topLevel) {
        if (targetIds.has(node.id)) continue;          // has an incoming edge  not a start node
        const section = getSectionForPosition(getAbsolutePosition(node, nodes), nodes);
        const sectionType = section?.data?.sectionType ?? "none";
        if (!startsBySection[sectionType]) startsBySection[sectionType] = [];
        startsBySection[sectionType].push(node);
    }

    for (const [sectionType, starts] of Object.entries(startsBySection)) {
        if (starts.length <= 1) continue;
        const label = SECTION_LABELS[sectionType] ?? sectionType;
        issues.push({
            nodeId: null,
            nodeName: `${label} section`,
            nodeType: "section",
            errors: [
                `Multiple start nodes found: ${starts.map(n => `"${n.data?.name || n.type}"`).join(", ")}. Only one node should have no incoming connection.`,
            ],
        });
    }

    //  Stale connection references 
    const connMap = new Map((connections || []).map(c => [c.id, c]));
    for (const node of nodes) {
        if (NON_EXECUTABLE.has(node.type)) continue;
        const connectionId = node.data?.connectionId;
        if (!connectionId) continue;
        if (!connMap.has(connectionId)) {
            issues.push({
                nodeId: node.id,
                nodeName: node.data?.name || node.type,
                nodeType: node.type,
                errors: [`References a saved connection that no longer exists. Update or clear the connection reference.`],
            });
        }
    }

    //  Empty processing section 
    const hasContainer = nodes.some(n => n.type === "workflowcontainer" || n.type === "section");
    if (hasContainer) {
        const hasProcessingNode = topLevel.some(node => {
            const section = getSectionForPosition(getAbsolutePosition(node, nodes), nodes);
            return section?.data?.sectionType === "processing";
        });
        if (!hasProcessingNode) {
            issues.push({
                nodeId: null,
                nodeName: "Processing section",
                nodeType: "section",
                errors: ["Processing section has no nodes. Add at least one node to define the workflow logic."],
            });
        }
    }

    return issues;
}
