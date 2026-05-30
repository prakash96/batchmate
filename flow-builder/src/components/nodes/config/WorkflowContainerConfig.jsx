import { Section, Field, TextInput, TextAreaInput } from "./ConfigHelpers";

const DEFAULT_TITLE = {
    processing:       "Processing",
    processingFailed: "Processing Failed",
};

export default function WorkflowContainerConfig({ node, updateNodeData }) {
    const d = node.data || {};
    const upd = (patch) => updateNodeData(node.id, patch);
    const defaultTitle = DEFAULT_TITLE[d.containerType] ?? "Processing";
    const isProcessing = (d.containerType ?? "processing") === "processing";

    // rethrowError defaults to true when not explicitly set
    const rethrowError = d.rethrowError !== false;

    return (
        <>
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

            {isProcessing && (
                <Section title="Error Handler" open>
                    <Field label="Rethrow exception after handling">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={rethrowError}
                                onChange={e => upd({ rethrowError: e.target.checked })}
                            />
                            <span style={{ fontSize: 11, color: "var(--text-2)" }}>
                                Re-throw the original exception after error handler steps run
                            </span>
                        </label>
                    </Field>
                    <Field label="Error variable prefix">
                        <TextInput
                            value={d.errorVarPrefix}
                            placeholder="error  →  error.message, error.type, error.stackTrace"
                            onChange={v => upd({ errorVarPrefix: v })}
                        />
                    </Field>
                </Section>
            )}
        </>
    );
}
