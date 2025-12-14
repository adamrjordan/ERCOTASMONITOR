import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Search, Activity, ChevronDown, ChevronUp, RefreshCw, EyeOff } from 'lucide-react';

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
            row[header] = values[index]?.trim();
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

  const processData = (resultObj) => {
    const { headers, data: parsedData } = resultObj;

    const processed = parsedData.map(row => {
      const newRow = { ...row };
      // Handle timestamp
      if (row.timestamp) { 
         const d = new Date(row.timestamp);
         newRow.ts = d.getTime();
         newRow.displayTime = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      } else if (row.scrape_timestamp_utc) {
         const d = new Date(row.scrape_timestamp_utc);
         newRow.ts = d.getTime();
         newRow.displayTime = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      }

      // Convert all other columns to numbers
      headers.forEach(h => {
          if (!h.includes('timestamp') && !h.includes('update')) {
             const val = Number(row[h]);
             newRow[h] = isNaN(val) ? null : val;
          }
      });
      return newRow;
    });

    const validData = processed.filter(d => d.ts).sort((a, b) => a.ts - b.ts);
    setRawData(validData);
    
    // Filter columns (exclude time/update)
    const metrics = headers.filter(h => !h.includes('timestamp') && !h.includes('update'));
    setColumns(metrics);

    // Default Selection: Try to find PRC or just pick first
    if (selectedColumns.length === 0 && metrics.length > 0) {
        const prc = metrics.find(m => m.includes('PRC'));
        setSelectedColumns([prc || metrics[0]]);
    }

    if (validData.length > 0) {
        const last = validData[validData.length - 1].ts;
        const start = validData[0].ts;
        // Zoom to last 6 hours
        const zoom = Math.max(start, last - (6 * 60 * 60 * 1000));
        setDateRange({
            start: new Date(zoom).toISOString().slice(0, 16),
            end: new Date(last).toISOString().slice(0, 16)
        });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error("CSV not found or access denied.");
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

  // Get current PRC for header
  const prcCol = columns.find(c => c.includes('PRC'));
  const currentPRC = (prcCol && rawData.length > 0) ? rawData[rawData.length - 1][prcCol] : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white"><Activity size={24} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">ERCOT Capacity Monitor</h1>
            <p className="text-xs text-slate-500">{loading ? "Syncing..." : "Live Data"}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
           <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-slate-400 block uppercase">System PRC</span>
              <span className={`text-xl font-bold ${currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
                 {currentPRC ?? '--'} MW
              </span>
           </div>
           <button onClick={fetchData} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
             <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
           </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative`}>
            <div className="p-4 border-b border-slate-100 space-y-4">
                <div className="relative">
                   <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                   <input type="text" placeholder="Search..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-md text-sm"
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
                {columns.filter(c => c.toLowerCase().includes(filterText.toLowerCase())).sort().map(col => (
                    <button key={col} onClick={() => toggleColumn(col)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex justify-between ${selectedColumns.includes(col) ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <span className="truncate">{col.replace(/_/g, ' ')}</span>
                        {selectedColumns.includes(col) && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </button>
                ))}
            </div>
        </aside>

        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="absolute bottom-4 z-20 bg-white border p-1 rounded-r shadow" style={{left: isSidebarOpen ? '320px' : '0'}}>
            {isSidebarOpen ? <ChevronDown className="rotate-90" size={16}/> : <ChevronUp className="rotate-90" size={16}/>}
        </button>

        {/* Main Chart */}
        <main className="flex-1 p-6 bg-slate-50 flex flex-col">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 p-4">
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
                            <YAxis stroke="#94a3b8" tick={{fontSize: 12}} />
                            <Tooltip contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Legend />
                            <Brush dataKey="ts" height={30} stroke="#cbd5e1" tickFormatter={() => ''} />
                            {selectedColumns.map((col, idx) => (
                                <Line key={col} type="monotone" dataKey={col} stroke={COLORS[idx % COLORS.length]} dot={false} strokeWidth={2} isAnimationActive={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <EyeOff size={48} className="mb-4 opacity-50"/>
                        <p>No Data</p>
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
