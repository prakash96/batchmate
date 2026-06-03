import { useMetadataStore } from '../../../store/metadataStore';
import {
    Section, Field,
    TextInput, NumberInput, SelectInput, CheckboxInput, TextAreaInput,
    inputStyle, labelStyle,
} from './ConfigHelpers';
import { useConnectionStore } from '../../../store/connectionStore';
import { useWorkflowStore } from '../../../store/workflowStore';
import { useVaultStore } from '../../../store/vaultStore';
import ExpressionInput from './ExpressionInput';
import { useExpressionSuggestions } from '../../../hooks/useExpressionSuggestions';

function isVisible(showWhen, data) {
    if (!showWhen) return true;
    const val = data[showWhen.key];
    if (showWhen.empty !== undefined) return showWhen.empty ? !val : !!val;
    if (showWhen.value !== undefined) return val === showWhen.value;
    if (showWhen.values) return showWhen.values.includes(val);
    if (showWhen.notValues) return !showWhen.notValues.includes(val);
    return true;
}

function ConnectionSelect({ value, connectionType, connectionTypes, onChange }) {
    const { connections } = useConnectionStore();
    const types = connectionTypes || (connectionType ? [connectionType] : null);
    const filtered = types ? connections.filter(c => types.includes(c.type)) : connections;
    return (
        <select
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            style={{ width: "100%", fontSize: 11, padding: "3px 5px", borderRadius: 4, border: "1px solid var(--border-sm)", background: "var(--bg-input)", color: "var(--text-1)", outline: "none" }}
        >
            <option value=""> None (configure below) </option>
            {filtered.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {filtered.length === 0 && types && (
                <option disabled>No database connections saved</option>
            )}
        </select>
    );
}

function WorkflowSelect({ value, onChange }) {
    const workflows = useWorkflowStore(s => s.workflows);
    const expandedRowId = useWorkflowStore(s => s.expandedRowId);
    const options = workflows.filter(w => w.id !== expandedRowId);
    return (
        <select
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            style={{ width: "100%", fontSize: 11, padding: "3px 5px", borderRadius: 4, border: "1px solid var(--border-sm)", background: "var(--bg-input)", color: "var(--text-1)", outline: "none" }}
        >
            <option value="">— Select workflow —</option>
            {options.map(w => (
                <option key={w.id} value={w.id}>{w.name || "Untitled"}</option>
            ))}
            {options.length === 0 && (
                <option disabled>No other workflows available</option>
            )}
        </select>
    );
}

function VaultKeySelect({ value, vaultKeyType, onChange }) {
    const vaultPackages = useVaultStore(s => s.vaultPackages);
    const entries = vaultPackages.flatMap(pkg => (pkg.entries || []).map(e => ({ ...e, pkgName: pkg.name })));
    const filtered = vaultKeyType ? entries.filter(e => e.type === vaultKeyType) : entries;
    return (
        <select
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            style={{ width: "100%", fontSize: 11, padding: "3px 5px", borderRadius: 4, border: "1px solid var(--border-sm)", background: "var(--bg-input)", color: "var(--text-1)", outline: "none" }}
        >
            <option value="">— Select vault key —</option>
            {filtered.map(e => (
                <option key={e.id} value={e.id}>{e.pkgName ? `${e.pkgName} / ${e.name}` : e.name}</option>
            ))}
            {filtered.length === 0 && (
                <option disabled>No PGP keys in vault</option>
            )}
        </select>
    );
}

function EntryCell({ ef, value, onChange, suggestions }) {
    const v = value ?? "";
    if (ef.type === "select") {
        return (
            <select
                value={v}
                onChange={e => onChange(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            >
                {ef.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    if (ef.type === "expression") {
        return (
            <div style={{ flex: 1, minWidth: 0 }}>
                <ExpressionInput value={v} placeholder={ef.placeholder} rows={1} suggestions={suggestions} onChange={onChange} bare={!!ef.bare} />
            </div>
        );
    }
    return (
        <input
            type="text"
            value={v}
            placeholder={ef.placeholder || ""}
            onChange={e => onChange(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
    );
}

function EntriesField({ field, data, upd, suggestions }) {
    const entries = data[field.key] || [];
    const setEntries = (next) => upd({ [field.key]: next });

    const addEntry = () => setEntries([...entries, { ...field.defaultEntry }]);
    const removeEntry = (i) => setEntries(entries.filter((_, idx) => idx !== i));
    const updateEntry = (i, ef, val) => {
        const next = entries.map((e, idx) => idx === i ? { ...e, [ef.key]: val } : e);
        setEntries(next);
    };

    return (
        <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={labelStyle}>{field.label}</span>
                <button
                    onClick={addEntry}
                    style={{ fontSize: 10, padding: "1px 7px", cursor: "pointer", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 3, background: "rgba(59,130,246,0.08)", color: "#60A5FA" }}
                >+ Add</button>
            </div>
            {entries.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginBottom: 2 }}>
                    {field.entryFields.map(ef => (
                        <span key={ef.key} style={{ ...labelStyle, flex: 1, minWidth: 0 }}>{ef.label}</span>
                    ))}
                    <span style={{ width: 20 }} />
                </div>
            )}
            {entries.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 3, marginBottom: 3, alignItems: "center" }}>
                    {field.entryFields.map(ef => (
                        <EntryCell
                            key={ef.key}
                            ef={ef}
                            value={entry[ef.key]}
                            onChange={val => updateEntry(i, ef, val)}
                            suggestions={suggestions}
                        />
                    ))}
                    <button
                        onClick={() => removeEntry(i)}
                        style={{ width: 20, padding: 0, fontSize: 12, cursor: "pointer", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 3, background: "rgba(239,68,68,0.06)", color: "#EF4444", flexShrink: 0 }}
                    >x</button>
                </div>
            ))}
        </div>
    );
}

function renderField(field, data, upd, suggestions) {
    if (!isVisible(field.showWhen, data)) return null;
    const onChange = (v) => upd({ [field.key]: v });

    switch (field.type) {
        case 'text':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <TextInput type="text" value={data[field.key]} placeholder={field.placeholder} onChange={onChange} />
                </Field>
            );
        case 'password':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <TextInput type="password" value={data[field.key]} placeholder={field.placeholder} onChange={onChange} />
                </Field>
            );
        case 'number':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <NumberInput value={data[field.key]} placeholder={field.placeholder} min={field.min} onChange={onChange} />
                </Field>
            );
        case 'select':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <SelectInput value={data[field.key]} options={field.options} onChange={onChange} />
                </Field>
            );
        case 'checkbox':
            return (
                <CheckboxInput key={`${field.key}|${field.label}`} checked={data[field.key]} label={field.label} onChange={onChange} />
            );
        case 'textarea':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <TextAreaInput value={data[field.key]} placeholder={field.placeholder} rows={field.rows} onChange={onChange} />
                </Field>
            );
        case 'connection':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <ConnectionSelect value={data[field.key]} connectionType={field.connectionType} connectionTypes={field.connectionTypes} onChange={onChange} />
                </Field>
            );
        case 'workflow':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <WorkflowSelect value={data[field.key]} onChange={onChange} />
                </Field>
            );
        case 'expression':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <ExpressionInput
                        value={data[field.key]}
                        placeholder={field.placeholder}
                        rows={field.rows}
                        suggestions={suggestions}
                        onChange={onChange}
                    />
                </Field>
            );
        case 'vault-key':
            return (
                <Field key={`${field.key}|${field.label}`} label={field.label}>
                    <VaultKeySelect value={data[field.key]} vaultKeyType={field.vaultKeyType} onChange={onChange} />
                </Field>
            );
        case 'entries':
            return (
                <EntriesField key={`${field.key}|entries`} field={field} data={data} upd={upd} suggestions={suggestions} />
            );
        default:
            return null;
    }
}

export default function GenericConfig({ node, updateNodeData }) {
    const nodeMetaMap = useMetadataStore(s => s.nodeMetaMap);
    const meta = nodeMetaMap[node.type];
    const suggestions = useExpressionSuggestions(node.id);

    if (!meta?.sections) return null;

    const d = node.data || {};
    const upd = (patch) => updateNodeData(node.id, patch);

    return (
        <>
            {meta.sections.map((section, si) => (
                <Section key={si} title={section.title} open={section.open !== false}>
                    {section.fields.map((field, fi) =>
                        <span key={`${field.key}-${fi}`}>{renderField(field, d, upd, suggestions)}</span>
                    )}
                </Section>
            ))}
        </>
    );
}
