import { useEffect, useState } from "react";
import { persistentStore } from "../../store/persistentStore";

export default function GlobalVariablesModal({ onClose }) {

  const { globalVariables, setGlobalVariables } = persistentStore();

  // convert object  stable array
  const [vars, setVars] = useState([]);

  useEffect(() => {
    const arr = Object.entries(globalVariables || {}).map(([k, v]) => ({
      id: crypto.randomUUID(),
      key: k,
      value: v
    }));
    setVars(arr);
  }, [globalVariables]);

  // add new row
  const addVar = () => {
    setVars(prev => [
      ...prev,
      { id: crypto.randomUUID(), key: "", value: "" }
    ]);
  };

  // update key
  const updateKey = (id, key) => {
    setVars(prev =>
      prev.map(v =>
        v.id === id ? { ...v, key } : v
      )
    );
  };

  // update value
  const updateValue = (id, value) => {
    setVars(prev =>
      prev.map(v =>
        v.id === id ? { ...v, value } : v
      )
    );
  };

  // delete
  const deleteVar = (id) => {
    setVars(prev => prev.filter(v => v.id !== id));
  };

  // save to store
  const save = () => {
    const obj = {};

    vars.forEach(v => {
      if (v.key) obj[v.key] = v.value;
    });

    setGlobalVariables(obj);
    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        <h2>Global Variables</h2>

        <div style={styles.list}>
          {vars.map(v => (
            <div key={v.id} style={styles.row}>

              <input
                style={styles.input}
                value={v.key}
                onChange={(e) => updateKey(v.id, e.target.value)}
                placeholder="key"
              />

              <input
                style={styles.input}
                value={v.value}
                onChange={(e) => updateValue(v.id, e.target.value)}
                placeholder="value"
              />

              <button onClick={() => deleteVar(v.id)}>
                
              </button>

            </div>
          ))}
        </div>

        <button onClick={addVar}>+ Add Variable</button>

        <div style={styles.footer}>
          <button onClick={save}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>

      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999
  },
  modal: {
    width: 520,
    background: "#fff",
    padding: 20,
    borderRadius: 10
  },
  list: {
    maxHeight: 300,
    overflowY: "auto",
    marginBottom: 10
  },
  row: {
    display: "flex",
    gap: 8,
    marginBottom: 8
  },
  input: {
    flex: 1,
    padding: 6
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10
  }
};