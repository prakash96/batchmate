import { useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { persistentStore } from "../../store/persistentStore";
import { BASE_URL } from "../../config";
import { evalTemplate } from "../../engine/expression/simple";


export default function DbTailModal({ onClose }) {
  const gridRef = useRef();
  const intervalRef = useRef();

  const [jdbcUrl, setJdbcUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);

  const [table, setTable] = useState("");
  const [timestampColumn, setTimestampColumn] = useState("");

  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);

  const [columnDefs, setColumnDefs] = useState([]);
  const [lastSeen, setLastSeen] = useState(null);
  const [search, setSearch] = useState("");
  const [rowData, setRowData] = useState([]);

  const {globalVariables} = persistentStore();

  const applyVariables = (input) => evalTemplate(input, { vars: globalVariables });


  //  CONNECT
  const connectDb = async () => {
    jdbcUrl = applyVariables(jdbcUrl);
    username = applyVariables(username);
    password = applyVariables(password);
    const res = await fetch(BASE_URL + "/db/tables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jdbcUrl, username, password }),
    });

    const data = await res.json();
    setTables(data);
    setConnected(true);
  };

  //  LOAD COLUMNS
  useEffect(() => {
    if (!table) return;

    jdbcUrl = applyVariables(jdbcUrl);
    username = applyVariables(username);
    password = applyVariables(password);
    fetch(BASE_URL + "/db/columns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jdbcUrl,
        username,
        password,
        table,
      }),
    })
      .then(res => res.json())
      .then(setColumns);
  }, [table]);

  //  FETCH DATA (CORE LOGIC)
  const fetchData = async () => {
    jdbcUrl = applyVariables(jdbcUrl);
    username = applyVariables(username);
    password = applyVariables(password);
    const res = await fetch(BASE_URL + "/db/tail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jdbcUrl,
        username,
        password,
        table,
        timestampColumn,
        lastSeen,
      }),
    });

    const data = await res.json();
    if (!data.length) return;

    //  set columns once
    if (columnDefs.length === 0) {
      setColumnDefs(
        Object.keys(data[0]).map(k => ({
          field: k,
          sortable: true,
          filter: true,
          flex: 1,
        }))
      );
    }

    //  add new rows
    gridRef.current.api.applyTransaction({
      add: data,
    });

    //  keep ONLY latest 1000 rows
    const rowCount = gridRef.current.api.getDisplayedRowCount();

    if (rowCount > 1000) {
      const removeCount = rowCount - 1000;
      const rowsToRemove = [];

      gridRef.current.api.forEachNode(node => {
        if (rowsToRemove.length < removeCount) {
          rowsToRemove.push(node.data);
        }
      });

      gridRef.current.api.applyTransaction({
        remove: rowsToRemove,
      });
    }

    //  update lastSeen
    const latest = data[data.length - 1][timestampColumn];
    setLastSeen(latest);
  };

  //  START POLLING
  const start = () => {
    setRunning(true);
    setLastSeen(null);
    setColumnDefs([]);

    setRowData([]);

    fetchData();
    intervalRef.current = setInterval(fetchData, 1000); // 1 sec
  };

  //  STOP
  const stop = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
  };

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* HEADER */}
        <div style={styles.header}>
          <div>DB Tail</div>
          <button onClick={onClose} style={styles.close}></button>
        </div>

        {/* CONNECTION */}
        <div style={styles.row}>
          <input
            placeholder="JDBC URL"
            value={jdbcUrl}
            onChange={e => setJdbcUrl(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="User"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={styles.input}
          />
          <button style={styles.btn} onClick={connectDb}>
            Connect
          </button>
        </div>

        {/* TABLE + COLUMN + CONTROL */}
        <div style={styles.row}>
          <select
            value={table}
            onChange={e => setTable(e.target.value)}
            style={styles.input}
          >
            <option value="">Table</option>
            {tables.map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>

          <select
            value={timestampColumn}
            onChange={e => setTimestampColumn(e.target.value)}
            style={styles.input}
          >
            <option value="">Timestamp Column</option>
            {columns.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>

          {!running ? (
            <button
              style={styles.startBtn}
              onClick={start}
              disabled={!table || !timestampColumn}
            >
              Start
            </button>
          ) : (
            <button style={styles.stopBtn} onClick={stop}>
              Stop
            </button>
          )}

          <input
            placeholder="Search..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              gridRef.current.api.setQuickFilter(e.target.value);
            }}
            style={styles.input}
          />
        </div>

        {/* GRID */}
        <div className="ag-theme-alpine" style={{ height: "420px" }}>
          <AgGridReact
            ref={gridRef}
            columnDefs={columnDefs}
            rowData={rowData}
            animateRows
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999, //  ADD THIS
  },
  modal: {
    width: "920px",
    background: "#fff",
    borderRadius: "10px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    fontWeight: "bold",
    fontSize: "14px",
  },
  close: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "16px",
  },
  row: {
    display: "flex",
    gap: "6px",
  },
  input: {
    flex: 1,
    padding: "6px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "12px",
  },
  btn: {
    background: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 10px",
    cursor: "pointer",
  },
  startBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 10px",
    cursor: "pointer",
  },
  stopBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 10px",
    cursor: "pointer",
  },
};