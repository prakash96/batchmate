import { Section, Field, TextInput, TextAreaInput } from "./ConfigHelpers";

const DEFAULT_TITLE = {
    processing:       "Processing",
    processingFailed: "Processing Failed",
};

export default function WorkflowContainerConfig({ node, updateNodeData }) {
    const d = node.data || {};
    const upd = (patch) => updateNodeData(node.id, patch);
    const defaultTitle = DEFAULT_TITLE[d.containerType] ?? "Processing";

    return (
        <Section title="Workflow Info" open>
            <Field label="Title">
                <TextInput
                    value={d.title}
                    placeholder={defaultTitle}
                    onChange={v => upd({ title: v })}
                />
            </Field>
            <Field label="Description">
                <TextAreaInput
                    value={d.description}
                    placeholder="What does this workflow do?"
                    rows={4}
                    onChange={v => upd({ description: v })}
                />
            </Field>
        </Section>
    );
}
