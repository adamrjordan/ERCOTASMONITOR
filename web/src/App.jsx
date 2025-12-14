import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Search, Activity, ChevronDown, ChevronUp, RefreshCw, EyeOff, Bug, Zap } from 'lucide-react';

// --- CONFIGURATION ---
const GITHUB_USERNAME = "adamrjordan"; 
const REPO_NAME = "ERCOTASMONITOR";
const BRANCH_NAME = "main";
const CSV_FILENAME = "ercot_ancillary_data.csv";

const DATA_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH_NAME}/${CSV_FILENAME}`;

// --- ALIASES ---
const COLUMN_ALIASES = {
  "DATA_SYSTEM_PRC": "System PRC",
  "DATA_SYSTEM_SYSTEMLAMBDA": "System Lambda",
};

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", 
  "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#4338ca"
];

// --- PARSER ---
const simpleCSVParse = (csvText) => {
    // Strip Byte Order Mark (BOM)
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
  const [selectedColumns, setSelectedColumns] = useState(['DATA_SYSTEM_PRC']);
  const [filterText, setFilterText] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- Helpers ---
  const formatColumnName = (col) => {
    if (COLUMN_ALIASES[col]) return COLUMN_ALIASES[col];
    
    // Aggressive shortening of the long ERCOT names
    let name = col
        .replace(/^DATA_/, '')
        .replace(/_GROUP/, '')
        .replace(/RESPONSIVERESERVECAPABILITYGROUP/, 'RRS Cap')
        .replace(/RESPONSIVERESERVEAWARDSGROUP/, 'RRS Award')
        .replace(/ERCOTCONTINGENCYRESERVECAPABILITYGROUP/, 'ECRS Cap')
        .replace(/ERCOTCONTINGENCYRESERVEAWARDSGROUP/, 'ECRS Award')
        .replace(/NONSPINRESERVECAPABILITYGROUP/, 'NonSpin Cap')
        .replace(/NONSPINRESERVEAWARDSGROUP/, 'NonSpin Award')
        .replace(/REGULATIONSERVICECAPABILITYGROUP/, 'Reg Cap')
        .replace(/REGULATIONSERVICEAWARDSGROUP/, 'Reg Award')
        .replace(/CAPABILITYGROUP/, 'Cap')
        .replace(/AWARDSGROUP/, 'Award')
        .replace(/_/g, ' ');
        
    // Clean up casing
    name = name.split(' ').map(word => {
         // Keep known acronyms uppercase, title case others
         if (['RRS', 'ECRS', 'PRC', 'ESR', 'QS', 'CLR', 'NCLR'].includes(word.toUpperCase())) return word.toUpperCase();
         return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');

    return name;
  };

  const processData = (resultObj) => {
    const { headers, data: parsedData } = resultObj;

    if (!parsedData || parsedData.length < 1) return;

    // Dynamic Timestamp Detection
    const timestampCol = headers.find(h => h.toLowerCase().includes('timestamp') || h.toLowerCase().includes('date'));
    
    const processed = parsedData.map(row => {
      const newRow = { ...row };
      if (timestampCol && row[timestampCol]) {
        const dateObj = new Date(row[timestampCol]);
        if (!isNaN(dateObj)) {
            newRow.timestamp = dateObj.getTime();
            newRow.displayTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            newRow.fullDate = row[timestampCol];
        }
      }

      headers.forEach(h => {
          let val = row[h];
          // Filter out garbage text data if it sneaks in
          if (typeof val === 'string' && (val.startsWith('[') || val.toLowerCase() === 'value')) return; 
          
          if(h !== timestampCol && val !== undefined && val !== null && val !== '' && !isNaN(Number(val))) {
              newRow[h] = Number(val);
          }
      });
      return newRow;
    });

    const validData = processed.filter(d => d.timestamp);
    validData.sort((a, b) => a.timestamp - b.timestamp);

    setRawData(validData);
    
    // Filter columns for sidebar
    const metricCols = headers.filter(h => {
        const lower = h.toLowerCase();
        return !lower.includes('timestamp') && 
               !lower.includes('update') &&
               !lower.includes('type') &&
               !lower.includes('index');
    });
    
    setColumns(metricCols);

    // Smart default selection
    if (metricCols.length > 0) {
        const currentIsValid = selectedColumns.every(sc => metricCols.includes(sc));
        if (!currentIsValid || selectedColumns.length === 0) {
            const prcCol = metricCols.find(c => c.includes('PRC'));
            setSelectedColumns([prcCol || metricCols[0]]);
        }
    }

    if (validData.length > 0) {
       const lastTime = validData[validData.length - 1].timestamp;
       const startTime = validData[0].timestamp;
       // Default to 6 hours or full range
       const zoomWindow = 6 * 60 * 60 * 1000;
       const start = startTime > (lastTime - zoomWindow) ? startTime : (lastTime - zoomWindow);
       
       setDateRange({
        start: new Date(start).toISOString().slice(0, 16),
        end: new Date(lastTime).toISOString().slice(0, 16)
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error("CSV file not found. Please wait for the scraper to run (approx 5 mins).");
        throw new Error(`Failed to fetch (${response.status})`);
      }
      
      const csvText = await response.text();
      const results = simpleCSVParse(csvText);
      
      if (results.data.length === 0) {
        setError("CSV is empty. Please wait for the scraper to collect data.");
      } else {
        processData(results);
      }
      setLoading(false);
      
    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    const startTs = new Date(dateRange.start).getTime();
    const endTs = new Date(dateRange.end).getTime();
    return rawData.filter(d => d.timestamp >= startTs && d.timestamp <= endTs);
  }, [rawData, dateRange]);

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const currentPRC = rawData.length > 0 ? rawData[rawData.length - 1]['DATA_SYSTEM_PRC'] : null;
  const lastUpdate = rawData.length > 0 ? new Date(rawData[rawData.length - 1].timestamp).toLocaleString() : '-';

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">ERCOT Capacity Monitor</h1>
            <p className="text-xs text-slate-500">
                {loading ? "Syncing..." : "Live Data"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System PRC</span>
            <span className={`text-xl font-bold ${currentPRC && currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
              {currentPRC ? currentPRC + " MW" : "--"}
            </span>
          </div>
           <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Update</span>
            <span className="text-sm font-medium text-slate-700">{lastUpdate}</span>
          </div>
          <button onClick={fetchData} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200" title="Refresh Data">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
           <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors text-sm font-medium">
            <Upload size={16} />
            <span className="hidden sm:inline">Upload CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 overflow-hidden relative`}>
            <div className="p-4 border-b border-slate-100 space-y-4">
               <div className="relative">
                   <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                   <input 
                    type="text" 
                    placeholder="Search metrics..." 
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                   />
               </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Time Range</label>
                    <input 
                        type="datetime-local" 
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                    />
                        <input 
                        type="datetime-local" 
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {columns
                    .filter(col => formatColumnName(col).toLowerCase().includes(filterText.toLowerCase()))
                    .sort()
                    .map(col => (
                    <button
                        key={col}
                        onClick={() => toggleColumn(col)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${
                            selectedColumns.includes(col) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <span className="truncate" title={col}>{formatColumnName(col)}</span>
                        {selectedColumns.includes(col) && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                    </button>
                ))}
            </div>
        </aside>

        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute left-0 bottom-4 z-20 bg-white border border-slate-200 p-1 rounded-r-md shadow-md hover:bg-slate-50"
            style={{ left: isSidebarOpen ? '320px' : '0' }}
        >
            {isSidebarOpen ? <ChevronDown className="rotate-90" size={16}/> : <ChevronUp className="rotate-90" size={16}/>}
        </button>

        <main className="flex-1 p-6 bg-slate-50 overflow-hidden flex flex-col">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 p-4 flex flex-col relative">
                {loading && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                        <RefreshCw className="animate-spin text-blue-600" size={48} />
                    </div>
                )}
                
                {error ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-red-500">
                        <Activity size={48} className="mb-4" />
                        <p className="text-center max-w-lg">{error}</p>
                    </div>
                ) : filteredData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="displayTime" 
                                stroke="#94a3b8" 
                                tick={{fontSize: 12}}
                                minTickGap={50}
                            />
                            <YAxis stroke="#94a3b8" tick={{fontSize: 12}} />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelStyle={{ color: '#64748b', marginBottom: '0.5rem' }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                            <Brush dataKey="timestamp" height={30} stroke="#cbd5e1" />
                            
                            {selectedColumns.map((col, index) => (
                                <Line 
                                    key={col}
                                    type="monotone" 
                                    dataKey={col} 
                                    name={formatColumnName(col)}
                                    stroke={col.includes('PRC') ? '#000000' : COLORS[index % COLORS.length]} 
                                    strokeWidth={col.includes('PRC') ? 3 : 2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                    isAnimationActive={false} 
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Zap size={48} className="mb-4 opacity-50"/>
                        <p className="font-bold">No data found</p>
                        <p className="text-sm mt-2">If you deleted the CSV, wait a few minutes for the scraper to run.</p>
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
