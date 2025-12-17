import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Search, Activity, ChevronDown, ChevronUp, RefreshCw, EyeOff, Calendar, Layout, Filter } from 'lucide-react';

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

// --- UTILS ---

// Helper to format ticks: Date at midnight, Time otherwise
const formatTick = (timestamp) => {
    const d = new Date(timestamp);
    const h = d.getHours();
    if (h === 0) {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Helper to generate 6-hour interval ticks
const getSixHourTicks = (start, end) => {
    const ticks = [];
    let current = new Date(start);
    
    // Round up to nearest 6 hour mark
    current.setMinutes(0, 0, 0);
    const hour = current.getHours();
    const remainder = hour % 6;
    // Add hours to reach next 6h mark, unless we are exactly on one
    const add = remainder === 0 ? 0 : (6 - remainder);
    current.setHours(hour + add);

    while (current.getTime() <= end) {
        ticks.push(current.getTime());
        current.setHours(current.getHours() + 6);
    }
    return ticks;
};

// Local Time Formatter for Inputs
const toLocalISOString = (dateObj) => {
  const pad = (n) => n < 10 ? '0' + n : n;
  return dateObj.getFullYear() +
    '-' + pad(dateObj.getMonth() + 1) +
    '-' + pad(dateObj.getDate()) +
    'T' + pad(dateObj.getHours()) +
    ':' + pad(dateObj.getMinutes());
};

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

  // --- COLUMN NAME FORMATTER ---
  const formatColumnName = (col) => {
    if (!col) return "";
    let name = col
        .replace(/^DATA_/, '')
        .replace(/RESPONSIVERESERVECAPABILITYGROUP_?/, 'RRS Cap ')
        .replace(/RESPONSIVERESERVEAWARDSGROUP_?/, 'RRS Award ')
        .replace(/ERCOTCONTINGENCYRESERVECAPABILITYGROUP_?/, 'ECRS Cap ')
        .replace(/ERCOTCONTINGENCYRESERVEAWARDSGROUP_?/, 'ECRS Award ')
        .replace(/NONSPINRESERVECAPABILITYGROUP_?/, 'NonSpin Cap ')
        .replace(/NONSPINRESERVEAWARDSGROUP_?/, 'NonSpin Award ')
        .replace(/REGULATIONSERVICECAPABILITYGROUP_?/, 'Reg Cap ')
        .replace(/REGULATIONSERVICEAWARDSGROUP_?/, 'Reg Award ')
        .replace(/SYSTEM_?/, 'System ')
        .replace(/_GROUP/, '')
        .replace(/_/g, ' ');

    name = name
        .replace(/RRCCAP/i, '')
        .replace(/RRAWD/i, '')
        .replace(/ECRSCAP/i, '')
        .replace(/ECRSAWD/i, '')
        .replace(/NSRCAP/i, '')
        .replace(/NSRAWD/i, '')
        .replace(/REGUPCAP/i, 'Up ')
        .replace(/REGDOWNCAP/i, 'Down ')
        .replace(/SYSTEMLAMBDA/i, 'Lambda');

    name = name.toLowerCase().split(' ').map(word => {
         if (['RRS', 'ECRS', 'PRC', 'ESR', 'QS', 'CLR', 'NCLR', 'PFR', 'FFR', 'GEN', 'LR'].includes(word.toUpperCase())) {
             return word.toUpperCase();
         }
         return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    return name.trim();
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
            // Full formatted string for tooltip
            newRow.displayTime = d.toLocaleString([], {
                month: 'short', day: 'numeric', 
                hour: '2-digit', minute: '2-digit'
            });
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
    
    const metrics = headers.filter(h => h !== timestampCol);
    setColumns(metrics);

    if (selectedColumns.length === 0 && metrics.length > 0) {
        const prc = metrics.find(m => m.includes('PRC'));
        setSelectedColumns([prc || metrics[0]]);
    }

    if (validData.length > 0) {
        const last = validData[validData.length - 1].ts;
        const start = validData[0].ts;
        // Default Zoom: Last 24 hours to show the day cycles clearly
        const zoom = Math.max(start, last - (24 * 60 * 60 * 1000));
        
        setDateRange({
            start: toLocalISOString(new Date(zoom)),
            end: toLocalISOString(new Date(last))
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

  // Generate ticks based on the filtered data range
  const xAxisTicks = useMemo(() => {
      if (filteredData.length === 0) return [];
      const start = filteredData[0].ts;
      const end = filteredData[filteredData.length - 1].ts;
      return getSixHourTicks(start, end);
  }, [filteredData]);

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const prcCol = columns.find(c => c.includes('PRC'));
  const currentPRC = (prcCol && rawData.length > 0) ? rawData[rawData.length - 1][prcCol] : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20 flex-shrink-0 h-16">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-lg text-white">
            <Activity size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">ERCOT Monitor</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{loading ? "SYNCING..." : "LIVE DASHBOARD"}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System PRC</span>
              <span className={`text-xl font-bold font-mono ${currentPRC && currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
                 {currentPRC ? currentPRC.toFixed(0) : '--'} <span className="text-sm text-slate-400 font-normal">MW</span>
              </span>
           </div>
           
           <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

           <div className="flex items-center gap-2">
                <button onClick={fetchData} className="p-2 bg-white border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors" title="Reload Data">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
                
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 cursor-pointer transition-colors text-sm font-medium shadow-sm">
                    <Upload size={16} />
                    <span className="hidden sm:inline">Upload CSV</span>
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
           </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* --- SIDEBAR --- */}
        <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative z-10`}>
            
            {/* Filter Section */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
               
               {/* Search */}
               <div className="relative">
                   <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                   <input 
                    type="text" 
                    placeholder="Filter metrics..." 
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                    value={filterText} 
                    onChange={e => setFilterText(e.target.value)} 
                   />
               </div>

               {/* Date Range */}
               <div className="space-y-2">
                   <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Calendar size={10} /> Time Range
                        </label>
                   </div>
                   <div className="grid grid-cols-1 gap-2">
                       <input 
                        type="datetime-local" 
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                        value={dateRange.start} 
                        onChange={e => setDateRange({...dateRange, start: e.target.value})} 
                       />
                       <input 
                        type="datetime-local" 
                        className="w-full text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                        value={dateRange.end} 
                        onChange={e => setDateRange({...dateRange, end: e.target.value})} 
                       />
                   </div>
               </div>
            </div>

            {/* Column List */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2 mt-2">Available Metrics</div>
                <div className="space-y-0.5">
                    {columns
                        .filter(c => formatColumnName(c).toLowerCase().includes(filterText.toLowerCase()))
                        .sort((a, b) => formatColumnName(a).localeCompare(formatColumnName(b)))
                        .map(col => (
                        <button 
                            key={col} 
                            onClick={() => toggleColumn(col)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-all duration-200 ${
                                selectedColumns.includes(col) 
                                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100' 
                                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                            }`}
                        >
                            <span className="truncate pr-2">{formatColumnName(col)}</span>
                            {selectedColumns.includes(col) && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                        </button>
                    ))}
                </div>
            </div>
        </aside>

        {/* Sidebar Toggle */}
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="absolute bottom-6 z-20 bg-white border border-slate-200 border-l-0 p-1.5 rounded-r-md shadow-md text-slate-500 hover:text-slate-800 transition-all" 
            style={{left: isSidebarOpen ? '320px' : '0'}}
        >
            <Layout size={16} />
        </button>

        {/* --- CHART AREA --- */}
        <main className="flex-1 p-4 bg-slate-100 flex flex-col overflow-hidden relative">
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 p-1 w-full h-full relative overflow-hidden flex flex-col">
                {/* Chart Header inside card */}
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                    <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Filter size={14} className="text-blue-500" />
                        {selectedColumns.length > 0 ? 'Selected Metrics Trends' : 'Select metrics to view'}
                    </h2>
                    <div className="text-xs text-slate-400 font-mono">
                        {filteredData.length} pts
                    </div>
                </div>

                <div className="flex-1 w-full relative min-h-0">
                    {error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 bg-white">
                            <Activity size={48} className="mb-4 opacity-20" />
                            <p className="font-medium">{error}</p>
                        </div>
                    ) : filteredData.length > 0 ? (
                        <div className="absolute inset-0 pb-2 pr-2 pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={filteredData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                                    
                                    {/* Customized X Axis with 6h Ticks */}
                                    <XAxis 
                                        dataKey="ts" 
                                        type="number" 
                                        domain={['dataMin', 'dataMax']} 
                                        tickFormatter={formatTick}
                                        ticks={xAxisTicks}
                                        stroke="#94a3b8" 
                                        tick={{fontSize: 11, fill: '#64748b'}} 
                                        tickMargin={10}
                                        minTickGap={30}
                                    />
                                    
                                    <YAxis 
                                        stroke="#94a3b8" 
                                        tick={{fontSize: 11, fill: '#64748b'}} 
                                        domain={['auto', 'auto']} 
                                        tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                                    />
                                    
                                    <Tooltip 
                                        contentStyle={{borderRadius:'8px', border:'1px solid #e2e8f0', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        labelFormatter={(label) => new Date(label).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                        formatter={(value, name) => [value, formatColumnName(name)]} 
                                    />
                                    
                                    <Legend 
                                        formatter={(value) => <span className="text-xs font-medium text-slate-600 ml-1">{formatColumnName(value)}</span>} 
                                        wrapperStyle={{paddingTop: '10px'}}
                                    />
                                    
                                    {selectedColumns.map((col, idx) => (
                                        <Line 
                                            key={col} 
                                            type="monotone" 
                                            dataKey={col} 
                                            name={col} 
                                            stroke={COLORS[idx % COLORS.length]} 
                                            strokeWidth={2} 
                                            dot={false} 
                                            activeDot={{ r: 5, strokeWidth: 0 }} 
                                            isAnimationActive={false} 
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                            <EyeOff size={48} className="mb-4 opacity-20"/>
                            <p className="font-medium text-sm">No data visible in this range</p>
                            <p className="text-xs mt-1 opacity-70">Adjust the time range on the left</p>
                        </div>
                    )}
                </div>
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
