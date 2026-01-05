import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { Upload, Search, Activity, ChevronDown, ChevronUp, RefreshCw, EyeOff, Calendar, Filter, Layout } from 'lucide-react';

const GITHUB_USERNAME = "adamrjordan"; 
const REPO_NAME = "ERCOTASMONITOR";
const BRANCH_NAME = "main";
const CSV_FILENAME = "ercot_ancillary_data.csv";
const DATA_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${BRANCH_NAME}/${CSV_FILENAME}`;

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#4338ca"];

// --- FIELD MAPPING & GROUPING ---
// Based on "ERCOT AS Aliases.csv" provided by the user.
// Structure: { raw_key: { label: "Readable Name", group: "Group Name" } }
const METRIC_CONFIG = {
    // RRS Capacity
    "RESPONSIVERESERVECAPABILITYGROUP_1_1": { label: "Generation Resources and Energy Storage Resources (ESRs) in the form of PFR", group: "RRS Capacity" },
    "RESPONSIVERESERVECAPABILITYGROUP_2_1": { label: "Load Resources excluding Controllable Load Resources", group: "RRS Capacity" },
    "RESPONSIVERESERVECAPABILITYGROUP_3_1": { label: "Controllable Load Resources in the form of PFR", group: "RRS Capacity" },
    "RESPONSIVERESERVECAPABILITYGROUP_4_1": { label: "Resources, other than ESRs, capable of Fast Frequency Response (FFR)", group: "RRS Capacity" },
    "RESPONSIVERESERVECAPABILITYGROUP_5_1": { label: "Energy Storage Resources in the form of FFR", group: "RRS Capacity" },

    // RRS Awards
    "RESPONSIVERESERVEAWARDSGROUP_1_1": { label: "Generation Resources and ESRs in the form of PFR", group: "RRS Awards" },
    "RESPONSIVERESERVEAWARDSGROUP_2_1": { label: "Load Resources excluding Controllable Load Resources in the form of UFR", group: "RRS Awards" },
    "RESPONSIVERESERVEAWARDSGROUP_3_1": { label: "Controllable Load Resources in the form of PFR", group: "RRS Awards" },
    "RESPONSIVERESERVEAWARDSGROUP_4_1": { label: "Resources capable of Fast Frequency Response", group: "RRS Awards" },

    // ECRS Capability
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_1_1": { label: "Generation Resources", group: "ECRS Capability" },
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_2_1": { label: "Load Resources other than Controllable Load Resources", group: "ECRS Capability" },
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_3_1": { label: "Controllable Load Resources", group: "ECRS Capability" },
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_4_1": { label: "Quick Start Generation Resources", group: "ECRS Capability" },
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_5_1": { label: "Energy Storage Resources", group: "ECRS Capability" },
    "ERCOTCONTINGENCYRESERVECAPABILITYGROUP_6_1": { label: "Capacity from Resources with a telemetered Resource Status of ONHOLD", group: "ECRS Capability" }, // Updated label based on typical data, might need verify

    // ECRS Awards
    "ERCOTCONTINGENCYRESERVEAWARDSGROUP_1_1": { label: "Generation Resources", group: "ECRS Awards" },
    "ERCOTCONTINGENCYRESERVEAWARDSGROUP_2_1": { label: "Load Resources excluding Controllable Load Resources", group: "ECRS Awards" },
    "ERCOTCONTINGENCYRESERVEAWARDSGROUP_3_1": { label: "Controllable Load Resources", group: "ECRS Awards" },
    "ERCOTCONTINGENCYRESERVEAWARDSGROUP_4_1": { label: "Quick Start Generation Resources", group: "ECRS Awards" },
    "ERCOTCONTINGENCYRESERVEAWARDSGROUP_5_1": { label: "Energy Storage Resources", group: "ECRS Awards" },

    // Non-Spin Capability
    "NONSPINRESERVECAPABILITYGROUP_1_1": { label: "On-Line Generation Resources with Energy Offer Curves", group: "Non-Spin Capability" },
    "NONSPINRESERVECAPABILITYGROUP_2_1": { label: "Off-Line Generation Resources with Output Schedules", group: "Non-Spin Capability" },
    "NONSPINRESERVECAPABILITYGROUP_3_1": { label: "Undeployed Controllable Load Resources", group: "Non-Spin Capability" },
    "NONSPINRESERVECAPABILITYGROUP_4_1": { label: "Off-Line Generation Resources Excluding QSGRs", group: "Non-Spin Capability" },
    "NONSPINRESERVECAPABILITYGROUP_5_1": { label: "Energy Storage Resources", group: "Non-Spin Capability" },

    // Non-Spin Awards
    "NONSPINRESERVEAWARDSGROUP_1_1": { label: "On-Line Generation Resources with Energy Offer Curves", group: "Non-Spin Awards" },
    "NONSPINRESERVEAWARDSGROUP_2_1": { label: "On-Line Generation Resources with Output Schedules", group: "Non-Spin Awards" },
    "NONSPINRESERVEAWARDSGROUP_3_1": { label: "Load Resources", group: "Non-Spin Awards" },
    "NONSPINRESERVEAWARDSGROUP_4_1": { label: "Off-Line Generation Resources Excluding QSGRs", group: "Non-Spin Awards" },
    "NONSPINRESERVEAWARDSGROUP_5_1": { label: "Quick Start Generation Resources", group: "Non-Spin Awards" },
    "NONSPINRESERVEAWARDSGROUP_6_1": { label: "Non-Spin awards on power augmentation capacity", group: "Non-Spin Awards" },

    // Regulation Capability
    "REGULATIONCAPACITYGROUP_1_1": { label: "Reg-Up Capability", group: "Regulation Capability" },
    "REGULATIONCAPACITYGROUP_2_1": { label: "Reg-Down Capability", group: "Regulation Capability" },
    "REGULATIONCAPACITYGROUP_3_1": { label: "Undeployed Reg-Up", group: "Regulation Capability" },
    "REGULATIONCAPACITYGROUP_4_1": { label: "Undeployed Reg-Down", group: "Regulation Capability" },
    "REGULATIONCAPACITYGROUP_5_1": { label: "Deployed Reg-Up", group: "Regulation Capability" },
    "REGULATIONCAPACITYGROUP_6_1": { label: "Deployed Reg-Down", group: "Regulation Capability" },

    // Regulation Awards
    "REGULATIONAWARDSGROUP_1_1": { label: "Reg-Up Awards", group: "Regulation Awards" },
    "REGULATIONAWARDSGROUP_2_1": { label: "Reg-Down Awards", group: "Regulation Awards" },

    // System Available Capacity (HSL/LASL)
    "SYSTEMAVAILABLECAPACITYGROUP_1_1": { label: "Aggregate telemetered HSL for On-Line Generation Resources", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_2_1": { label: "Aggregate telemetered HSL for On-Line Generation Resources with a telemetered Low Sustained Limit (LSL) equal to 0", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_3_1": { label: "Aggregate telemetered HSL for On-Line Intermittent Renewable Resources (IRRs) - Wind", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_4_1": { label: "Aggregate telemetered HSL for On-Line Intermittent Renewable Resources (IRRs) - PV", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_5_1": { label: "Aggregate telemetered HSL for On-Line Energy Storage Resources (ESRs)", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_6_1": { label: "Aggregate telemetered HSL for Off-Line Generation Resources", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_7_1": { label: "Aggregate telemetered HSL for Off-Line Quick Start Generation Resources (QSGRs)", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_8_1": { label: "Aggregate telemetered HSL for On-Line Quick Start Generation Resources (QSGRs)", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_9_1": { label: "Aggregate telemetered HSL for Combined Cycle Generation Resources", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_10_1": { label: "Aggregate telemetered HSL capacity for Resources with a telemetered Resource Status of OUT", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_11_1": { label: "Aggregate telemetered HSL for Resources with status of ONREG", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_12_1": { label: "Aggregate telemetered HSL for Resources with status of ONDSR", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_13_1": { label: "Capacity available to increase Generation Resource Base Points in the next 5 minutes in SCED (HDL)", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_14_1": { label: "Capacity available to decrease Generation Resource Base Points in the next 5 minutes in SCED (LDL)", group: "System Available Capacity" },
    "SYSTEMAVAILABLECAPACITYGROUP_15_1": { label: "Capacity to provide Reg-Up, RRS, or both (HASL)", group: "System Available Capacity" }, // Shortened for brevity

    // System PRC
    "ERCOTWIDEPHYSICALRESPONSIVECAPABILITYGROUP_1_1": { label: "ERCOT-wide Physical Responsive Capability (PRC)", group: "System PRC" },

    // RT ORDC
    "REALTIMEOPERATINGRESERVEDEMANDCURVECAPABILITYGROUP_1_1": { label: "Real-Time On-Line reserve capacity", group: "RT ORDC Curve Capacity" },
    "REALTIMEOPERATINGRESERVEDEMANDCURVECAPABILITYGROUP_2_1": { label: "Real-Time On-Line and Off-Line reserve capacity", group: "RT ORDC Curve Capacity" },
    
    // EMR Out
    "EMROUTANDOUTLCAPACITYGROUP_1_1": { label: "Aggregate telemetered HSL capacity for Resources with a telemetered Resource Status of EMR", group: "EMR Out and Out-L Capacity" },
    "EMROUTANDOUTLCAPACITYGROUP_2_1": { label: "Aggregate telemetered HSL capacity for Resources with a telemetered Resource Status of OUTL", group: "EMR Out and Out-L Capacity" }
};

const toLocalISOString = (dateObj) => {
  const pad = (n) => n < 10 ? '0' + n : n;
  return dateObj.getFullYear() + '-' + pad(dateObj.getMonth() + 1) + '-' + pad(dateObj.getDate()) + 'T' + pad(dateObj.getHours()) + ':' + pad(dateObj.getMinutes());
};

const formatTick = (timestamp) => {
    const d = new Date(timestamp);
    return d.getHours() === 0 ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const getSixHourTicks = (startTs, endTs) => {
    const ticks = [];
    let current = new Date(startTs);
    current.setMinutes(0, 0, 0);
    const hour = current.getHours();
    const add = (hour % 6 === 0) ? 0 : (6 - (hour % 6));
    current.setHours(hour + add);
    while (current.getTime() <= endTs) {
        ticks.push(current.getTime());
        current.setHours(current.getHours() + 6);
    }
    return ticks;
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
  
  // Manage Groups State (open/closed)
  const [expandedGroups, setExpandedGroups] = useState({});

  const formatColumnName = (col) => {
    // Return specific label if mapped, otherwise basic cleanup
    if (METRIC_CONFIG[col]) {
        return METRIC_CONFIG[col].label;
    }
    let name = col.replace(/_/g, ' ').replace(/DATA/i, '').replace(/GROUP/i, '').replace(/AGGREGATIONS/i, 'Agg: ');
    return name.trim();
  };

  const getColumnGroup = (col) => {
      if (METRIC_CONFIG[col]) {
          return METRIC_CONFIG[col].group;
      }
      return "Other Metrics";
  };

  const toggleGroup = (groupName) => {
      setExpandedGroups(prev => ({
          ...prev,
          [groupName]: !prev[groupName]
      }));
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
            newRow.displayTime = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
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
        const prc = metrics.find(m => m.includes('ERCOTWIDEPHYSICAL'));
        setSelectedColumns([prc || metrics[0]]);
        // Auto-expand the group of the default selected column
        const group = getColumnGroup(prc || metrics[0]);
        setExpandedGroups({ [group]: true });
    }

    if (validData.length > 0) {
        const last = validData[validData.length - 1].ts;
        const start = validData[0].ts;
        setDateRange({
            start: toLocalISOString(new Date(start)),
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

  const xAxisTicks = useMemo(() => {
      if (filteredData.length === 0) return [];
      return getSixHourTicks(filteredData[0].ts, filteredData[filteredData.length - 1].ts);
  }, [filteredData]);

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const prcCol = columns.find(c => c.includes('ERCOTWIDEPHYSICAL') || c.includes('PRC'));
  const currentPRC = (prcCol && rawData.length > 0) ? rawData[rawData.length - 1][prcCol] : null;

  // --- GROUPING LOGIC ---
  const groupedColumns = useMemo(() => {
      const groups = {};
      columns.forEach(col => {
          const groupName = getColumnGroup(col);
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(col);
      });
      return groups;
  }, [columns]);

  // Sorted Group Names (Prioritize specific order if needed, otherwise alpha)
  const sortedGroupNames = useMemo(() => {
      return Object.keys(groupedColumns).sort();
  }, [groupedColumns]);


  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20 flex-shrink-0 h-16">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-lg text-white"><Activity size={20} /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">ERCOT Monitor</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{loading ? "SYNCING..." : "LIVE DASHBOARD"}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
           <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System PRC</span>
              <span className={`text-xl font-bold font-mono ${currentPRC && currentPRC < 2300 ? 'text-red-600' : 'text-emerald-600'}`}>
                 {currentPRC ? Number(currentPRC).toFixed(0) : '--'} <span className="text-sm text-slate-400 font-normal">MW</span>
              </span>
           </div>
           <button onClick={fetchData} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200" title="Reload Data">
             <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
           </button>
           <label className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 cursor-pointer transition-colors text-sm font-medium shadow-sm">
            <Upload size={16} />
            <span className="hidden sm:inline">Upload CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative z-10 shadow-lg`}>
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-4">
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
               <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={10} /> Time Range</label>
                   <div className="grid grid-cols-1 gap-2">
                       <input type="datetime-local" className="w-full text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                       <input type="datetime-local" className="w-full text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                   </div>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2 mt-2">Available Metrics</div>
                <div className="space-y-2">
                    {sortedGroupNames.map(group => {
                        // Filter columns in this group that match search
                        const groupCols = groupedColumns[group].filter(c => formatColumnName(c).toLowerCase().includes(filterText.toLowerCase()));
                        
                        if (groupCols.length === 0) return null;

                        return (
                            <div key={group} className="border border-slate-100 rounded-md overflow-hidden">
                                <button 
                                    onClick={() => toggleGroup(group)}
                                    className="w-full px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 flex justify-between items-center hover:bg-slate-100 transition-colors"
                                >
                                    <span>{group}</span>
                                    {expandedGroups[group] ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                </button>
                                
                                {expandedGroups[group] && (
                                    <div className="bg-white p-1 space-y-0.5">
                                        {groupCols.sort((a, b) => formatColumnName(a).localeCompare(formatColumnName(b))).map(col => (
                                            <button 
                                                key={col} 
                                                onClick={() => toggleColumn(col)}
                                                className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-start justify-between group transition-all duration-200 ${
                                                    selectedColumns.includes(col) 
                                                        ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm border border-blue-100' 
                                                        : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                                                }`}
                                            >
                                                <span className="whitespace-normal leading-tight pr-2">{formatColumnName(col)}</span>
                                                {selectedColumns.includes(col) && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </aside>

        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="absolute bottom-6 z-20 bg-white border border-slate-200 border-l-0 p-1.5 rounded-r-md shadow-md text-slate-500 hover:text-slate-800 transition-all" style={{left: isSidebarOpen ? '320px' : '0'}}>
            <Layout size={16} />
        </button>

        <main className="flex-1 p-4 bg-slate-100 flex flex-col overflow-hidden relative" style={{ flex: 1, padding: '1rem', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 p-1 w-full h-full relative overflow-hidden flex flex-col" style={{ backgroundColor: 'white', borderRadius: '0.75rem', border: '1px solid #e2e8f0', width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                    <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Filter size={14} className="text-blue-500" />{selectedColumns.length > 0 ? `${selectedColumns.length} Metrics Active` : 'Select metrics to view'}</h2>
                    <div className="text-xs text-slate-400 font-mono">{filteredData.length} pts</div>
                </div>
                <div className="flex-1 w-full relative min-h-0" style={{ flex: 1, width: '100%', position: 'relative', height: 'calc(100vh - 150px)' }}>
                    {error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 bg-white"><Activity size={48} className="mb-4 opacity-20" /><p className="font-medium">{error}</p></div>
                    ) : filteredData.length > 0 ? (
                        <div className="absolute inset-0 pb-2 pr-2 pt-4" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={filteredData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                                    <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTick} ticks={xAxisTicks} stroke="#94a3b8" tick={{fontSize: 11, fill: '#64748b'}} tickMargin={10} minTickGap={30} />
                                    <YAxis stroke="#94a3b8" tick={{fontSize: 11, fill: '#64748b'}} domain={['auto', 'auto']} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                                    <Tooltip contentStyle={{borderRadius:'8px', border:'1px solid #e2e8f0', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)', maxWidth: '400px'}} labelFormatter={(label) => new Date(label).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})} formatter={(value, name) => [value, formatColumnName(name)]} />
                                    <Legend formatter={(value) => <span className="text-xs font-medium text-slate-600 ml-1">{formatColumnName(value)}</span>} wrapperStyle={{paddingTop: '10px'}} />
                                    {selectedColumns.map((col, idx) => (
                                        <Line key={col} type="monotone" dataKey={col} name={col} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><EyeOff size={48} className="mb-4 opacity-20"/><p className="font-medium text-sm">No data visible in this range</p></div>
                    )}
                </div>
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;
