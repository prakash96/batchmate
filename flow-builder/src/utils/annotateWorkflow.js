import { getSectionForPosition, getAbsolutePosition } from "./sectionRules";

const NON_ANNOTATABLE = new Set(["section", "workflowcontainer", "errorscope"]);

// Maps internal sectionType keys to the label used in the exported JSON.
const SECTION_LABEL = {
    processing:       "processing",
    processingFailed: "processingFailed",
};

/**
 * Returns a copy of `nodes` where every executable node gets a top-level
 * `section` field ("processing" | "processingFailed" | "verify" | "verifyFailed") derived from
 * its canvas position relative to the workflow container.
 */
export function annotateNodesWithSection(nodes) {
    return nodes.map(node => {
        if (NON_ANNOTATABLE.has(node.type)) return node;
        const sectionNode = getSectionForPosition(getAbsolutePosition(node, nodes), nodes);
        const sectionType = sectionNode?.data?.sectionType;
        if (!sectionType) return node;
        return { ...node, section: SECTION_LABEL[sectionType] ?? sectionType };
    });
}
