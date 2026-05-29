import { useState, useEffect } from "react";
import { persistentStore } from "../../../../store/persistentStore";
import { BASE_URL } from "../../../../config";
import { evalTemplate } from "../../../../engine/expression/simple";

export default function DBDialog({
    onClose,
    onSave,
    initialData,
}) {
    const [jdbcUrl, setJdbcUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [query, setQuery] = useState("");
    const [testStatus, setTestStatus] = useState("");
    const [testLoading, setTestLoading] = useState(false);

    const {globalVariables} = persistentStore();

    // Apply variable substitution (Simple expression language)
    const applyVariables = (input) => evalTemplate(input, { vars: globalVariables });

    // Prefill
    useEffect(() => {
        if (!initialData.connection) return;

        setJdbcUrl(initialData.connection.jdbcUrl || "");
        setUsername(initialData.connection.username || "");
        setPassword(initialData.connection.password || "");
        setQuery(initialData.query || "");
    }, [initialData]);

    // Save
    const handleSave = () => {
        onSave({
            connection: {
                jdbcUrl,
                username,
                password,
            },
            query,
        });
        onClose();
    };

    // Test Connection
    const testConnection = async () => {
        if (!jdbcUrl || !username || !password) {
            setTestStatus("Please fill in all connection fields");
            return;
        }

        try {
            setTestLoading(true);
            setTestStatus("Testing...");

            // Apply variable substitution
            const resolvedJdbcUrl = applyVariables(jdbcUrl);
            const resolvedUsername = applyVariables(username);
            const resolvedPassword = applyVariables(password);

            const res = await fetch(BASE_URL + "/db/tables", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jdbcUrl: resolvedJdbcUrl, username: resolvedUsername, password: resolvedPassword }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || data?.message || "Connection failed");
            }

            setTestStatus("Connection successful");
        } catch (err) {
            setTestStatus(`Error: ${err?.message || "Connection failed"}`);
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <button
                    onClick={onClose}
                    style={styles.closeButton}
                >
                    
                </button>
                <h3>Database Configuration</h3>

                <div style={styles.form}>
                    <div style={styles.row}>
                        <label>JDBC URL:</label>
                        <input
                            type="text"
                            value={jdbcUrl}
                            onChange={(e) => setJdbcUrl(e.target.value)}
                            placeholder="jdbc:postgresql://localhost:5432/mydb"
                        />
                    </div>

                    <div style={styles.row}>
                        <label>Username:</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="user"
                        />
                    </div>

                    <div style={styles.row}>
                        <label>Password:</label>
                        <div style={styles.passwordField}>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="password"
                                style={styles.passwordInput}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                style={styles.eyeButton}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? "" : ""}
                            </button>
                        </div>
                    </div>

                    <div style={styles.row}>
                        <label>Query:</label>
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="SELECT * FROM table"
                            style={{ height: 100 }}
                        />
                    </div>
                </div>

                {testStatus && (
                    <div style={{
                        fontSize: "12px",
                        marginTop: 10,
                        padding: 8,
                        borderRadius: 4,
                        backgroundColor: testStatus.includes("") ? "#e8f5e9" : "#ffebee",
                        color: testStatus.includes("") ? "#2e7d32" : "#c62828"
                    }}>
                        {testStatus}
                    </div>
                )}

                <div style={styles.actions}>
                    <button onClick={onClose} style={styles.cancelButton}>Cancel</button>
                    <button onClick={testConnection} disabled={testLoading} style={styles.testButton}>
                        {testLoading ? "Testing..." : "Test Connection"}
                    </button>
                    <button onClick={handleSave} style={styles.saveButton}>Save</button>
                </div>
            </div>
        </div>
    );
}

    


const styles = {
    overlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
    },
    modal: {
        background: "white",
        padding: 20,
        borderRadius: 8,
        width: 500,
        maxHeight: "80vh",
        overflow: "auto",
        position: "relative",
    },
    closeButton: {
        position: "absolute",
        top: 10,
        right: 10,
        background: "none",
        border: "none",
        fontSize: 20,
        cursor: "pointer",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    row: {
        display: "flex",
        flexDirection: "column",
        gap: 5,
    },
    passwordField: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    passwordInput: {
        flex: 1,
    },
    eyeButton: {
        background: "none",
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 16,
        lineHeight: 1,
    },
    testButton: {
        backgroundColor: "#1976d2",
        color: "white",
        border: "none",
        padding: "8px 12px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 14,
    },
    cancelButton: {
        backgroundColor: "#f5f5f5",
        color: "#333",
        border: "1px solid #ddd",
        padding: "8px 16px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 14,
    },
    saveButton: {
        backgroundColor: "#4caf50",
        color: "white",
        border: "none",
        padding: "8px 16px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 14,
    },
    actions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        marginTop: 20,
    },
};