import { useState } from "react";

export const sectionStyle = {
    marginBottom: 4,
    border: "1px solid var(--border-xs)",
    borderRadius: 6,
    overflow: "hidden",
    background: "var(--surface)",
};

export const summaryStyle = {
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 10,
    background: "var(--surface-2)",
    userSelect: "none",
    color: "var(--text-1)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
};

export const bodyStyle = { padding: "6px 8px" };
export const fieldStyle = { marginBottom: 5 };
export const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 11,
    padding: "3px 6px",
    border: "1px solid var(--border-sm)",
    borderRadius: 4,
    outline: "none",
    color: "var(--text-1)",
    background: "var(--bg-input)",
    fontFamily: "'Inter', sans-serif",
};
export const labelStyle = { display: "block", fontSize: 10, color: "var(--text-1)", marginBottom: 2 };

export function Field({ label, children }) {
    return (
        <div style={fieldStyle}>
            <label style={labelStyle}>{label}</label>
            {children}
        </div>
    );
}

export function TextInput({ value, placeholder, onChange, type = "text" }) {
    return (
        <input
            type={type}
            style={inputStyle}
            value={value || ""}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

export function NumberInput({ value, placeholder, onChange, min }) {
    return (
        <input
            type="number"
            style={inputStyle}
            value={value ?? ""}
            placeholder={placeholder}
            min={min}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
    );
}

export function CheckboxInput({ checked, label, onChange }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 4 }}>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    );
}

export function SelectInput({ value, options, onChange }) {
    return (
        <select style={inputStyle} value={value || ""} onChange={(e) => onChange(e.target.value)}>
            {options.map(({ value: v, label }) => (
                <option key={v} value={v}>{label}</option>
            ))}
        </select>
    );
}

export function TextAreaInput({ value, placeholder, onChange, rows = 3 }) {
    return (
        <textarea
            style={{ ...inputStyle, height: rows * 20, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
            value={value || ""}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}


export function Section({ title, open = false, children }) {
    return (
        <details style={sectionStyle} open={open}>
            <summary style={summaryStyle}>{title}</summary>
            <div style={bodyStyle}>{children}</div>
        </details>
    );
}

export function SftpConnectionSection({ d, upd }) {
    return (
        <Section title="Connection" open>
            <Field label="Server Address">
                <TextInput value={d.host} placeholder="sftp.example.com" onChange={(v) => upd({ host: v })} />
            </Field>
            <Field label="Port">
                <NumberInput value={d.port} placeholder="22" min={1} onChange={(v) => upd({ port: v })} />
            </Field>
            <Field label="Username">
                <TextInput value={d.username} placeholder="user" onChange={(v) => upd({ username: v })} />
            </Field>
            <Field label="Password">
                <TextInput type="password" value={d.password} placeholder="" onChange={(v) => upd({ password: v })} />
            </Field>
            <Field label="Private Key File Path">
                <TextInput value={d.privateKeyFile} placeholder="/home/user/.ssh/id_rsa" onChange={(v) => upd({ privateKeyFile: v })} />
            </Field>
            <Field label="Private Key Passphrase">
                <TextInput type="password" value={d.privateKeyPassphrase} placeholder="" onChange={(v) => upd({ privateKeyPassphrase: v })} />
            </Field>
        </Section>
    );
}

export function SftpSecuritySection({ d, upd }) {
    return (
        <Section title="Security">
            <Field label="Known Hosts File">
                <TextInput value={d.knownHostsFile} placeholder="/home/user/.ssh/known_hosts" onChange={(v) => upd({ knownHostsFile: v })} />
            </Field>
            <Field label="Host Verification">
                <SelectInput
                    value={d.hostVerification || "ask"}
                    options={[
                        { value: "yes", label: "Yes - enforce strict checking" },
                        { value: "no", label: "No - skip host verification" },
                        { value: "ask", label: "Ask - prompt on unknown host" }
                    ]}
                    onChange={(v) => upd({ hostVerification: v })}
                />
            </Field>
            <Field label="Preferred Authentication Methods">
                <TextInput value={d.preferredAuthMethods} placeholder="publickey,password" onChange={(v) => upd({ preferredAuthMethods: v })} />
            </Field>
            <Field label="Compression Level (0-9, 0=off)">
                <NumberInput value={d.compressionLevel} placeholder="0" min={0} onChange={(v) => upd({ compressionLevel: Math.min(9, Math.max(0, v)) })} />
            </Field>
        </Section>
    );
}

export function SftpReliabilitySection({ d, upd }) {
    return (
        <Section title="Connection Reliability">
            <Field label="Connection Timeout (ms)">
                <NumberInput value={d.connectTimeout} placeholder="10000" min={0} onChange={(v) => upd({ connectTimeout: v })} />
            </Field>
            <Field label="Socket Timeout (ms)">
                <NumberInput value={d.socketTimeout} placeholder="30000" min={0} onChange={(v) => upd({ socketTimeout: v })} />
            </Field>
            <Field label="Max Reconnect Attempts">
                <NumberInput value={d.maxReconnectAttempts} placeholder="3" min={0} onChange={(v) => upd({ maxReconnectAttempts: v })} />
            </Field>
            <Field label="Reconnect Wait (ms)">
                <NumberInput value={d.reconnectWait} placeholder="1000" min={0} onChange={(v) => upd({ reconnectWait: v })} />
            </Field>
            <CheckboxInput checked={d.disconnectAfterUse} label="Disconnect After Each Use" onChange={(v) => upd({ disconnectAfterUse: v })} />
        </Section>
    );
}

export function SftpProxySection({ d, upd }) {
    return (
        <Section title="Proxy">
            <Field label="Proxy Server">
                <TextInput value={d.proxyHost} placeholder="proxy.internal.com" onChange={(v) => upd({ proxyHost: v })} />
            </Field>
            <Field label="Proxy Port">
                <NumberInput value={d.proxyPort} placeholder="1080" min={1} onChange={(v) => upd({ proxyPort: v })} />
            </Field>
            <Field label="Proxy Type">
                <SelectInput
                    value={d.proxyType || "SOCKS5"}
                    options={[
                        { value: "SOCKS4", label: "SOCKS4" },
                        { value: "SOCKS5", label: "SOCKS5" },
                        { value: "HTTP", label: "HTTP" }
                    ]}
                    onChange={(v) => upd({ proxyType: v })}
                />
            </Field>
            <Field label="Proxy Username">
                <TextInput value={d.proxyUsername} placeholder="proxy-user" onChange={(v) => upd({ proxyUsername: v })} />
            </Field>
            <Field label="Proxy Password">
                <TextInput type="password" value={d.proxyPassword} placeholder="" onChange={(v) => upd({ proxyPassword: v })} />
            </Field>
        </Section>
    );
}

export function FtpConnectionSection({ d, upd }) {
    return (
        <Section title="Connection" open>
            <Field label="Server Address">
                <TextInput value={d.host} placeholder="ftp.example.com" onChange={(v) => upd({ host: v })} />
            </Field>
            <Field label="Port">
                <NumberInput value={d.port} placeholder="21" min={1} onChange={(v) => upd({ port: v })} />
            </Field>
            <Field label="Username">
                <TextInput value={d.username} placeholder="user" onChange={(v) => upd({ username: v })} />
            </Field>
            <Field label="Password">
                <TextInput type="password" value={d.password} placeholder="" onChange={(v) => upd({ password: v })} />
            </Field>
            <Field label="Security Mode">
                <SelectInput
                    value={d.securityMode || "none"}
                    options={[
                        { value: "none", label: "None (plain FTP)" },
                        { value: "explicit", label: "FTPS - Explicit TLS (STARTTLS)" },
                        { value: "implicit", label: "FTPS - Implicit TLS (port 990)" }
                    ]}
                    onChange={(v) => upd({ securityMode: v })}
                />
            </Field>
            <Field label="Transfer Mode">
                <SelectInput
                    value={d.transferMode || "passive"}
                    options={[
                        { value: "passive", label: "Passive (PASV) - recommended" },
                        { value: "active", label: "Active (PORT)" }
                    ]}
                    onChange={(v) => upd({ transferMode: v })}
                />
            </Field>
        </Section>
    );
}

export function AwsCredentialsSection({ d, upd }) {
    return (
        <Section title="AWS Credentials" open>
            <Field label="AWS Region">
                <TextInput value={d.awsRegion} placeholder="us-east-1" onChange={(v) => upd({ awsRegion: v })} />
            </Field>
            <Field label="Access Key ID">
                <TextInput value={d.accessKeyId} placeholder="AKIA..." onChange={(v) => upd({ accessKeyId: v })} />
            </Field>
            <Field label="Secret Access Key">
                <TextInput type="password" value={d.secretAccessKey} placeholder="" onChange={(v) => upd({ secretAccessKey: v })} />
            </Field>
            <Field label="Session Token (temporary credentials)">
                <TextInput value={d.sessionToken} placeholder="optional" onChange={(v) => upd({ sessionToken: v })} />
            </Field>
            <Field label="Custom Endpoint (S3-compatible storage)">
                <TextInput value={d.endpoint} placeholder="https://minio.internal:9000" onChange={(v) => upd({ endpoint: v })} />
            </Field>
            <CheckboxInput checked={d.pathStyleAccess} label="Force Path-Style Access (required for custom endpoints)" onChange={(v) => upd({ pathStyleAccess: v })} />
        </Section>
    );
}
