import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Search, Activity, ChevronDown, ChevronUp, RefreshCw, EyeOff, Bug } from 'lucide-react';

// --- CONFIGURATION ---
const GITHUB_USERNAME = "adamrjordan"; 
const REPO_NAME = "ERCOTASMONITOR";
const BRANCH_NAME = "main";
const CSV_FILENAME = "ercot_ancillary_data.csv";

const DATA_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH_NAME}/${CSV_FILENAME}`;

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", 
  "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#4338ca"
];

// --- PARSER ---
const simpleCSVParse = (csvText) => {
    const cleanText = csvText.replace(/^\ufeff/, '');
    const lines = cleanText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return { headers: [], data: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < headers.length) continue;
        const row = {};
        headers.forEach((header, index) => {
            const val = values[index]?.trim();
            row[header] = val ? val.replace(/['"]+/g, '') : val; 
        });
        parsedData.push(row);
    }
    return { headers, data: parsedData };
};

const App = () => {
  const [rawData, setRawData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // --- COLUMN NAME FORMATTER ---
  const formatColumnName = (col) => {
    if (!col) return "";
    let name = col.replace(/^DATA_/, '').replace(/_/g, ' ');
    // Strip group names
    const groups = ['RESPONSIVERESERVECAPABILITYGROUP','RESPONSIVERESERVEAWARDSGROUP','ERCOTCONTINGENCYRESERVECAPABILITYGROUP','ERCOTCONTINGENCYRESERVEAWARDSGROUP','NONSPINRESERVECAPABILITYGROUP','NONSPINRESERVEAWARDSGROUP','REGULATIONSERVICECAPABILITYGROUP','REGULATIONSERVICEAWARDSGROUP','SYSTEM'];
    groups.forEach(g => { name = name.replace(g, ''); });
    
    // Clean Suffixes & Title Case
    name = name.replace(/RRCCAP/i,'').replace(/RRAWD/i,'').replace(/ECRSCAP/i,'').replace(/ECRSAWD/i,'').replace(/NSRCAP/i,'').replace(/NSRAWD/i,'').replace(/REGUPCAP/i,'Up').replace(/REGDOWNCAP/i,'Down').replace(/SYSTEMLAMBDA/i,'Lambda');
    return name.trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const processData = (resultObj) => {
    const { headers, data: parsedData } = resultObj;
    if (!parsedData || parsedData.length < 1) return;

    const timestampCol = headers.find(h => h.toLowerCase().includes('timestamp') || h.toLowerCase().includes('date'));
    
    const processed = parsedData.map(row => {
      const newRow = { ...row };
      if (timestampCol && row[timestampCol]) { 
         const d = new Date(row[timestampCol]);
         if (!isNaN(d)) {
            newRow.ts = d.getTime();
            newRow.displayTime = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
         }
      }
      headers.forEach(h => {
          if (h !== timestampCol) {
             const val = Number(row[h]);
             newRow[h] = isNaN(val) ? null : val;
          }
      });
      return newRow;
    });

    const validData = processed.filter(d => d.ts).sort((a, b) => a.ts - b.ts);
    setRawData(validData);
    
    const metrics = headers.filter(h => h !== timestampCol && !h.toLowerCase().includes('update'));
    setColumns(metrics);

    if (selectedColumns.length === 0 && metrics.length > 0) {
        const prc = metrics.find(m => m.includes('DATA_SYSTEM_PRC'));
        setSelectedColumns([prc || metrics[0]]);
    }

    if (validData.length > 0) {
        const last = validData[validData.length - 1].ts;
        const start = validData[0].ts;
        // Format to Local ISO for input value
        const toLocalISO = (ts) => {
            const d = new Date(ts);
            const pad = (n) => n < 10 ? '0'+n : n;
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        setDateRange({
            start: toLocalISO(start),
            end: toLocalISO(last)
        });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error("CSV not found. Check GitHub repo.");
      const text = await response.text();
      const results = simpleCSVParse(text);
      if (results.data.length === 0) throw new Error("CSV is empty");
      processData(results);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const results = simpleCSVParse(e.target.result);
        processData(results);
      };
      reader.readAsText(file);
    }
  };

  const filteredData = useMemo(() => {
    if (!dateRange.start || !dateRange.end || rawData.length === 0) return rawData;
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();
    return rawData.filter(d => d.ts >= start && d.ts <= end);
  }, [rawData, dateRange]);

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const prcCol = columns.find(c => c.includes('PRC'));
  const currentPRC = (prcCol && rawData.length > 0) ? rawData[rawData.length - 1][prcCol] : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white"><Activity size={24} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">ERCOT Capacity Monitor</h1>
            <p className="text-xs text-slate-500">{loading ? "Syncing..." : "Live Data"}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-slate-400 block uppercase">System PRC</span>
              <span className={`text-xl font-bold ${currentPRC && currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
                 {currentPRC ? currentPRC.toFixed(0) : '--'} MW
              </span>
           </div>
           
           <button onClick={() => setShowDebug(!showDebug)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500" title="Debug Info">
             <Bug size={16} />
           </button>

           <button onClick={fetchData} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200" title="Reload CSV">
             <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
           </button>
           
           <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors text-sm font-medium border border-blue-100">
            <Upload size={16} />
            <span className="hidden sm:inline">Upload CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative`}>
            <div className="p-4 border-b border-slate-100 space-y-4">
                <div className="relative">
                   <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                   <input type="text" placeholder="Search metrics..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-md text-sm"
                    value={filterText} onChange={e => setFilterText(e.target.value)} />
               </div>
               <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase">Time Range</label>
                   <input type="datetime-local" className="w-full text-xs border rounded px-2 py-1"
                    value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                   <input type="datetime-local" className="w-full text-xs border rounded px-2 py-1"
                    value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {columns
                    .filter(c => formatColumnName(c).toLowerCase().includes(filterText.toLowerCase()))
                    .sort((a, b) => formatColumnName(a).localeCompare(formatColumnName(b)))
                    .map(col => (
                    <button key={col} onClick={() => toggleColumn(col)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex justify-between group transition-colors ${selectedColumns.includes(col) ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <span className="truncate" title={col}>{formatColumnName(col)}</span>
                        {selectedColumns.includes(col) && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </button>
                ))}
            </div>
        </aside>

        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="absolute bottom-4 z-20 bg-white border p-1 rounded-r shadow" style={{left: isSidebarOpen ? '320px' : '0'}}>
            {isSidebarOpen ? <ChevronDown className="rotate-90" size={16}/> : <ChevronUp className="rotate-90" size={16}/>}
        </button>

        {/* Main Chart Area */}
        <main className="flex-1 p-6 bg-slate-50 overflow-auto"> 
            
            {/* Debug Overlay */}
            {showDebug && (
                <div className="fixed top-20 right-4 z-50 bg-black/90 text-white p-4 rounded text-xs w-96 max-h-96 overflow-auto shadow-xl border border-gray-600">
                    <h3 className="font-bold border-b mb-2 pb-1">Debug Info</h3>
                    <p><strong>Raw Data Rows:</strong> {rawData.length}</p>
                    <p><strong>Filtered Rows:</strong> {filteredData.length}</p>
                    <p><strong>Columns Found:</strong> {columns.length}</p>
                    <p><strong>Selected:</strong> {selectedColumns.join(', ')}</p>
                    <p><strong>Range:</strong> {dateRange.start} <br/>to {dateRange.end}</p>
                    <pre className="mt-2 bg-gray-800 p-2 rounded">{JSON.stringify(rawData[0], null, 2)}</pre>
                </div>
            )}

            {/* CHART CONTAINER: HARD CODED HEIGHT - NO FLEXBOX TRICKS */}
            <div className="w-full bg-white rounded-xl shadow-sm border border-slate-200 p-4" style={{ height: '600px' }}>
                {error ? (
                    <div className="h-full flex flex-col items-center justify-center text-red-500">
                        <Activity size={48} className="mb-4" />
                        <p>{error}</p>
                    </div>
                ) : filteredData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="displayTime" stroke="#94a3b8" tick={{fontSize: 12}} minTickGap={50} />
                            <YAxis stroke="#94a3b8" tick={{fontSize: 12}} domain={['auto', 'auto']} />
                            <Tooltip 
                                contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                formatter={(value, name) => [value, formatColumnName(name)]} 
                            />
                            <Legend formatter={(value) => formatColumnName(value)} />
                            <Brush dataKey="ts" height={30} stroke="#cbd5e1" tickFormatter={() => ''} />
                            {selectedColumns.map((col, idx) => (
                                <Line key={col} type="monotone" dataKey={col} name={col} stroke={COLORS[idx % COLORS.length]} dot={false} strokeWidth={2} isAnimationActive={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <EyeOff size={48} className="mb-4 opacity-50"/>
                        <p>No Data Visible</p>
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
