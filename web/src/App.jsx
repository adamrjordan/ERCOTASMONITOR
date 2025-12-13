import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Calendar, Search, Filter, Activity, Zap, Clock, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

// --- CONFIGURATION ---
// IMPORTANT: REPLACE THESE WITH YOUR GITHUB USERNAME AND REPO NAME
const GITHUB_USERNAME = "adamrjordan"; 
const REPO_NAME = "ERCOTASMONITOR";
const BRANCH_NAME = "main";
const CSV_FILENAME = "ercot_ancillary_data.csv";

// Construct the raw URL to fetch data directly from the repo
const DATA_URL = `https://raw.githubusercontent.com/${adamrjordan}/${ERCOTASMONITOR}/${BRANCH_NAME}/${CSV_FILENAME}`;

const COLUMN_ALIASES = {
  "DATA_SYSTEM_PRC": "System PRC",
  "DATA_SYSTEM_SYSTEMLAMBDA": "System Lambda",
  "DATA_RESPONSIVERESERVECAPABILITYGROUP_RRSCAPGEN": "RRS Cap (Gen)",
  "DATA_RESPONSIVERESERVECAPABILITYGROUP_RRSCAPLOAD": "RRS Cap (Load)",
  "DATA_RESPONSIVERESERVECAPABILITYGROUP_RRSCAPNCLR": "RRS Cap (NCLR)",
  "DATA_REGULATIONSERVICECAPABILITYGROUP_REGUPCAP": "RegUp Cap",
  "DATA_REGULATIONSERVICECAPABILITYGROUP_REGDOWNCAP": "RegDown Cap",
  "DATA_NONSPINRESERVECAPABILITYGROUP_NSRCAPGEN": "Non-Spin Cap (Gen)",
  "DATA_NONSPINRESERVECAPABILITYGROUP_NSRCAPESR": "Non-Spin Cap (ESR)",
  "DATA_ERCOTCONTINGENCYRESERVECAPABILITYGROUP_ECRSCAPGEN": "ECRS Cap (Gen)",
};

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", 
  "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#4338ca"
];

// --- VANILLA JS CSV PARSER (REPLACING PAPAPARSE) ---
const simpleCSVParse = (csvText) => {
    // Basic split by line, skipping blank lines
    const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Simple header parsing (using comma delimiter)
    const headers = lines[0].split(',').map(h => h.trim());
    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
        // Simple split by comma for values. This assumes no quotes or complex CSV structure.
        const values = lines[i].split(',');
        // Skip malformed rows
        if (values.length !== headers.length) continue;

        const row = {};
        headers.forEach((header, index) => {
            const val = values[index]?.trim();
            row[header] = val; // Store as string initially, conversion happens in processData
        });
        parsedData.push(row);
    }
    return parsedData;
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

  const processData = (parsedData) => {
    if (!parsedData || parsedData.length < 1) return;

    const headers = Object.keys(parsedData[0]);
    
    const processed = parsedData.map(row => {
      const newRow = { ...row };
      if (row.scrape_timestamp_utc) {
        newRow.timestamp = new Date(row.scrape_timestamp_utc).getTime();
        newRow.displayTime = new Date(row.scrape_timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        newRow.fullDate = row.scrape_timestamp_utc;
      }
      // Convert numeric strings to actual numbers
      headers.forEach(h => {
          // Check if the key exists, is not the timestamp, and can be converted to a number
          if(h !== 'scrape_timestamp_utc' && row[h] !== undefined && row[h] !== null && !isNaN(Number(row[h]))) {
              newRow[h] = Number(row[h]);
          }
      });
      return newRow;
    });

    setRawData(processed);
    
    const metricCols = headers.filter(h => 
      !h.toLowerCase().includes('timestamp') && 
      !h.toLowerCase().includes('update') &&
      !h.toLowerCase().includes('type') &&
      !h.toLowerCase().includes('index') // Filter out temporary index columns
    );
    setColumns(metricCols);

    if (processed.length > 0) {
       setDateRange({
        start: processed[0].scrape_timestamp_utc ? processed[0].scrape_timestamp_utc.slice(0, 16) : '',
        end: processed[processed.length - 1].scrape_timestamp_utc ? processed[processed.length - 1].scrape_timestamp_utc.slice(0, 16) : ''
      });
    }
  };

  const fetchData = async () => {
    // Check if configuration placeholders are still active
    if (GITHUB_USERNAME === "YOUR_USERNAME_HERE" || REPO_NAME === "YOUR_REPO_NAME_HERE") {
        setError("Configuration Error: Please update GITHUB_USERNAME and REPO_NAME in App.jsx.");
        return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        // Provide more descriptive error for HTTP failures
        const status = response.status;
        let errMsg = `Failed to fetch data (Status: ${status}).`;
        if (status === 404) {
             errMsg = "404 Not Found. Check if the CSV file exists in your repo and the GITHUB_USERNAME/REPO_NAME are correct.";
        } else if (status === 403) {
             errMsg = "403 Forbidden. Ensure your repo is public and the branch name is correct.";
        }
        throw new Error(errMsg);
      }
      
      const csvText = await response.text();
      
      const results = simpleCSVParse(csvText); // Use custom parser
      
      // Filter out rows that are entirely empty or invalid
      const cleanData = results.filter(row => 
        Object.values(row).some(val => val !== "" && val !== null && val !== undefined)
      );

      if (cleanData.length === 0) {
        setError("CSV loaded, but contains no meaningful data rows.");
      } else {
        processData(cleanData);
      }
      setLoading(false);
      
    } catch (err) {
      console.error(err);
      setError(`Could not load data: ${err.message}`);
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
        const csvText = e.target.result;
        const results = simpleCSVParse(csvText); // Use custom parser
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

  const formatColumnName = (col) => {
    if (COLUMN_ALIASES[col]) return COLUMN_ALIASES[col];
    let name = col.replace(/^DATA_/, '').replace(/GROUP_/, '').replace(/_/g, ' ');
    name = name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    name = name.replace(/Prc/i, 'PRC').replace(/Rrs/i, 'RRS').replace(/Ecrs/i, 'ECRS').replace(/Nsr/i, 'Non-Spin').replace(/Esr/i, 'ESR');
    return name;
  };

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const currentPRC = rawData.length > 0 ? rawData[rawData.length - 1]['DATA_SYSTEM_PRC'] : '-';
  const lastUpdate = rawData.length > 0 ? new Date(rawData[rawData.length - 1].scrape_timestamp_utc).toLocaleString() : '-';

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
            <span className={`text-xl font-bold ${currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
              {currentPRC} MW
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
                        {(GITHUB_USERNAME === "YOUR_USERNAME_HERE" || REPO_NAME === "YOUR_REPO_NAME_HERE") && (
                            <p className="mt-4 text-sm text-red-700 font-medium">
                                ACTION REQUIRED: Please edit web/src/App.jsx and replace the placeholder values for GITHUB_USERNAME and REPO_NAME.
                            </p>
                        )}
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
                                    stroke={COLORS[index % COLORS.length]} 
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                    isAnimationActive={false} 
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <p>No Data Loaded</p>
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
