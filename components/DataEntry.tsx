
import React, { useState, useMemo } from 'react';
import { DepartmentMismatch, HolidaysMap, LocksMap } from '../types.ts';
import * as XLSX from 'xlsx';

interface DataEntryProps {
  data: DepartmentMismatch[];
  onDataUpdate: (data: DepartmentMismatch[]) => void;
  holidaysMap: HolidaysMap;
  setHolidaysMap: React.Dispatch<React.SetStateAction<HolidaysMap>>;
  locksMap: LocksMap;
  setLocksMap: React.Dispatch<React.SetStateAction<LocksMap>>;
}

const SALES_TEAMS = ['Achievers', 'Passionate', 'Concord', 'Dynamic'];

const PRESET_PRODUCTS: Record<string, string[]> = {
  'Achievers': [
    'Asvon Tab 10/100mg 30s', 'Atoxan 30mg Tab.', 'D-ABS injection (IM)', 
    'D-ABS injection (IM) 5s', 'Pentallin Syp. IVY', 'Oplex 50mg/5ml Syrup 120ml',
    'Roplex 50mg/5ml Syrup 120ml', 'Swicef 100mg/5ml Susp.', 'Swicef DS 200mg/5ml Susp.', 
    'Vitaglobin Plus Syp', 'Vitaglobin Syp.', 'VITAGLOBIN Syrup 120ml', 'Vonz Tab 10mg 30s', 'Vonz Tab 20mg 30s'
  ],
  'Passionate': [
    'Cyestra Tablet', 'Ferriboxy Injection 500mg / 10ml', 'LER 2.5mg Tablet', 
    'Neet', 'Nomo-D 10/10mg Tablet', 'Oplex F 100mg/0.35mg 30s Tab',
    'Roplex F 100mg/0.35mg 30s Tab', 'Swicef 400mg Cap.', 'Vitaglobin Tablets'
  ],
  'Concord': ['Gaviscon Liquid', 'Panadol 500mg', 'Brufen 400mg', 'Augmentin 625mg'],
  'Dynamic': ['Solu-Cortef 100mg', 'Voren Inj', 'Dicloran Gel', 'Xylocaine 2%']
};

export const DataEntry: React.FC<DataEntryProps> = ({ 
  data, 
  onDataUpdate,
  holidaysMap,
  setHolidaysMap,
  locksMap,
  setLocksMap
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'master' | 'daily' | 'config'>('daily');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const selectedMonth = viewDate.getMonth();
  const selectedYear = viewDate.getFullYear();
  const monthKey = `${selectedYear}-${selectedMonth}`;
  const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][selectedMonth];

  const getEffectiveHolidays = (hols: number[] | undefined) => {
    if (hols !== undefined) return hols;
    const sundays: number[] = [];
    const d = new Date(selectedYear, selectedMonth, 1);
    while (d.getMonth() === selectedMonth) {
      if (d.getDay() === 0) sundays.push(d.getDate());
      d.setDate(d.getDate() + 1);
    }
    return sundays;
  };

  const currentHolidays = getEffectiveHolidays(holidaysMap[monthKey]);
  const isLocked = locksMap[monthKey] || false;
  const isHolidaysEditable = isAdminMode || !isLocked;

  const workingDays = useMemo(() => {
    let count = 0;
    const date = new Date(selectedYear, selectedMonth, 1);
    while (date.getMonth() === selectedMonth) {
      const dayNum = date.getDate();
      const isMarkedHoliday = currentHolidays.includes(dayNum);
      if (!isMarkedHoliday) count++;
      date.setDate(date.getDate() + 1);
    }
    return count;
  }, [selectedMonth, selectedYear, currentHolidays]);

  const handleMonthChange = (offset: number) => {
    const newDate = new Date(selectedYear, selectedMonth + offset, 1);
    setViewDate(newDate);
    setUploadError(null);
  };

  const toggleHoliday = (day: number) => {
    if (!isHolidaysEditable) return;
    setHolidaysMap(prev => {
      const existing = getEffectiveHolidays(prev[monthKey]);
      const updated = existing.includes(day) 
        ? existing.filter(d => d !== day) 
        : [...existing, day];
      return { ...prev, [monthKey]: updated };
    });
  };

  const handleLockHolidays = () => {
    if (confirm(`Confirm ${workingDays} working days for ${monthName} ${selectedYear}? This will lock the configuration.`)) {
      setLocksMap(prev => ({ ...prev, [monthKey]: true }));
    }
  };

  const handleAdminToggle = () => {
    if (!isAdminMode) {
      const pin = prompt("Enter Admin Override PIN:");
      if (pin === "786") setIsAdminMode(true);
      else alert("Invalid PIN.");
    } else {
      setIsAdminMode(false);
    }
  };

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'master' | 'daily') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const salesSheetName = wb.SheetNames.find(name => name.toLowerCase() === 'sales');
        
        if (!salesSheetName) {
          setUploadError("ERROR: 'Sales' sheet not found in the selected Excel file.");
          setIsUploading(false);
          return;
        }

        const ws = wb.Sheets[salesSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        
        let extractedDate = "";
        let dataColumnIndex = -1;
        let isMasterLikely = false;
        let isDailyLikely = false;

        const monthList = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        
        for (let r = 0; r < Math.min(rows.length, 30); r++) {
          for (let c = 0; c < 20; c++) {
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            const cell = ws[cellAddress];
            if (!cell) continue;
            
            const textValue = cell.w ? String(cell.w).trim() : String(cell.v || "").trim();
            const lowVal = textValue.toLowerCase();

            if (!extractedDate && monthList.some(m => lowVal.includes(m)) && (lowVal.includes("202") || lowVal.includes("203"))) {
              extractedDate = textValue;
              isDailyLikely = true;
            }

            if (lowVal.includes("master plan") || lowVal.includes("annual target") || lowVal.includes("budget 20")) {
              isMasterLikely = true;
            }

            if (lowVal === "actual" || lowVal === "achievement" || lowVal === "achievment") {
              if (type === 'daily') dataColumnIndex = c;
              isDailyLikely = true;
            }

            if (lowVal === "target" || lowVal === "tgt" || lowVal === "plan") {
              if (type === 'master') dataColumnIndex = c;
              if (!isDailyLikely) isMasterLikely = true;
            }
          }
        }

        if (type === 'master' && isDailyLikely && !isMasterLikely) {
           setUploadError("VALIDATION FAILED: This appears to be a Daily Achievement file. Please upload the Master Plan.");
           setIsUploading(false);
           return;
        }

        if (type === 'daily' && isMasterLikely && !isDailyLikely) {
          setUploadError("VALIDATION FAILED: This appears to be a Master Plan file. Please upload a Daily Report.");
          setIsUploading(false);
          return;
        }

        if (dataColumnIndex === -1) dataColumnIndex = 1; 

        if (type === 'daily' && !extractedDate) {
          setUploadError("ERROR: Missing valid date header (e.g. 'Monday, Jan 01, 2025') in the Sales sheet.");
          setIsUploading(false);
          return;
        }

        const entries: DepartmentMismatch[] = [];
        rows.forEach((row) => {
          const productCell = String(row[0] || "").trim();
          const numericCell = row[dataColumnIndex];
          
          if (!productCell || productCell === "Row Labels" || productCell === "Grand Total" || 
              productCell.toLowerCase() === "actual" || productCell.toLowerCase() === "tgt" || 
              SALES_TEAMS.includes(productCell) || monthList.some(m => productCell.toLowerCase().includes(m))) {
            return;
          }

          let foundTeam = "";
          let officialName = "";
          for (const team of SALES_TEAMS) {
            const match = PRESET_PRODUCTS[team].find(p => normalize(p) === normalize(productCell));
            if (match) {
              foundTeam = team;
              officialName = match;
              break;
            }
          }

          if (foundTeam) {
            const val = parseFloat(String(numericCell || "0").replace(/,/g, ""));
            if (!isNaN(val)) {
              if (type === 'master') {
                entries.push({
                  department: 'Sales',
                  team: foundTeam,
                  metric: officialName,
                  plan: val,
                  actual: 0,
                  variance: 0,
                  unit: 'Units',
                  status: 'on-track',
                  reportDate: undefined
                });
              } else {
                entries.push({
                  department: 'Sales',
                  team: foundTeam,
                  metric: officialName,
                  plan: 0,
                  actual: val,
                  variance: 0,
                  unit: 'Units',
                  status: 'on-track',
                  reportDate: extractedDate
                });
              }
            }
          }
        });

        if (entries.length > 0) {
          let updatedData: DepartmentMismatch[] = [];
          if (type === 'daily') {
            updatedData = [
              ...data.filter(d => d.reportDate !== extractedDate),
              ...entries
            ];
          } else {
            const nonSales = data.filter(d => d.department !== 'Sales');
            const dailySales = data.filter(d => d.department === 'Sales' && d.reportDate !== undefined);
            const existingMaster = data.filter(d => d.department === 'Sales' && d.reportDate === undefined);
            
            const mergedMaster = [...existingMaster];
            entries.forEach(newEntry => {
              const idx = mergedMaster.findIndex(m => m.metric === newEntry.metric && m.team === newEntry.team);
              if (idx > -1) mergedMaster[idx] = newEntry;
              else mergedMaster.push(newEntry);
            });

            updatedData = [...nonSales, ...dailySales, ...mergedMaster];
          }
          
          onDataUpdate(updatedData);
          setUploadError(null);
          alert(`SUCCESS: ${entries.length} products updated in ${type === 'master' ? 'Master Plan' : 'Daily Achievement'}.`);
        } else {
          setUploadError("IMPORT FAILED: No recognized products found in Column 1. Ensure product names match the Swiss catalog.");
        }
      } catch (err) {
        setUploadError("SYSTEM ERROR: Failed to parse Excel file structure.");
      } finally {
        setIsUploading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const renderCalendar = () => {
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const daysArray: (number | null)[] = [...Array(firstDay).fill(null)];
    for (let i = 1; i <= daysInMonth; i++) daysArray.push(i);

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-6">
            <div className="flex gap-2">
              <button onClick={() => handleMonthChange(-1)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => handleMonthChange(1)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">{monthName} {selectedYear}</h3>
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isLocked && !isAdminMode ? 'text-green-600' : 'text-slate-400'}`}>
                {isLocked && !isAdminMode ? '🔒 CONFIGURATION FINALIZED' : 'Select holidays (including Sundays) for this cycle'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Net Working Days</p>
            <p className="text-5xl font-black text-slate-900 italic tracking-tighter">{workingDays}</p>
          </div>
        </div>

        <div className={`grid grid-cols-7 gap-2 transition-opacity duration-500 ${!isHolidaysEditable ? 'opacity-70' : 'opacity-100'}`}>
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
            <div key={d} className="py-2 text-center text-[9px] font-black text-slate-400 tracking-widest">{d}</div>
          ))}
          {daysArray.map((day, idx) => {
            if (!day) return <div key={idx} className="h-14 bg-slate-50/50 rounded-xl" />;
            const isSunday = new Date(selectedYear, selectedMonth, day).getDay() === 0;
            const isHoliday = currentHolidays.includes(day);

            return (
              <button
                key={idx}
                disabled={!isHolidaysEditable}
                onClick={() => toggleHoliday(day)}
                className={`h-14 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center relative ${
                  isHoliday ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-95' :
                  isSunday ? 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-red-600 hover:text-red-600' :
                  'bg-white border border-slate-200 text-slate-700 hover:border-red-600 hover:text-red-600'
                }`}
              >
                <span>{day}</span>
                {isSunday && !isHoliday && <span className="text-[7px] font-bold opacity-60">SUN</span>}
                {isHoliday && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full" />}
              </button>
            );
          })}
        </div>

        <div className="pt-8 flex flex-col items-center gap-4">
          {isLocked && !isAdminMode ? (
            <div className="flex flex-col items-center gap-2">
              <span className="bg-green-100 text-green-700 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                MONTHLY TARGETS LOCKED
              </span>
              <p className="text-[9px] text-slate-400 font-bold uppercase">To make changes, please use the Admin Override at the top.</p>
            </div>
          ) : (
            <button 
              onClick={handleLockHolidays}
              className="bg-green-700 text-white px-12 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              FINALIZE WORKING DAYS
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-12 pb-20">
      <div className="flex flex-col items-center text-center space-y-4">
        <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Swiss Data Pipeline</h2>
        <div className="flex flex-col items-center">
          <div className="bg-red-600 text-white px-6 py-2 rounded-full text-[12px] font-black uppercase tracking-[0.2em] shadow-lg mb-2">
            SALES ONLY PORTAL
          </div>
          <p className="text-slate-500 font-medium italic">Operational data synchronization gateway for Sales team products.</p>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={handleAdminToggle}
            className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${isAdminMode ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-md' : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-900'}`}
          >
            {isAdminMode ? '🔓 ADMIN MODE: ON' : '🔒 ADMIN MODE: OFF'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[4rem] border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button onClick={() => { setActiveTab('daily'); setUploadError(null); }} className={`flex-1 py-8 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${activeTab === 'daily' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}>Daily Achievement</button>
          <button onClick={() => { setActiveTab('master'); setUploadError(null); }} className={`flex-1 py-8 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${activeTab === 'master' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100'}`}>Master Plan</button>
          <button onClick={() => { setActiveTab('config'); setUploadError(null); }} className={`flex-1 py-8 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${activeTab === 'config' ? (isLocked && !isAdminMode ? 'bg-green-800 text-white' : 'bg-green-700 text-white') : 'text-slate-400 hover:bg-slate-100'}`}>Working Days</button>
        </div>

        <div className="p-16">
          {activeTab === 'config' ? (
            renderCalendar()
          ) : (
            <div className="flex flex-col items-center space-y-10">
              <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-5xl shadow-inner transition-all duration-500 ${activeTab === 'daily' ? 'bg-red-50 text-red-600 rotate-3' : 'bg-slate-100 text-slate-900 -rotate-3'}`}>
                {activeTab === 'daily' ? '📡' : '📁'}
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking tight italic">
                  {activeTab === 'daily' ? 'Product Daily Sync' : 'Product Master Sync'}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line-Item Product Verification Active</p>
                <div className="mt-2 inline-block px-4 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black tracking-widest uppercase">Strict Type Verification Active</div>
              </div>
              
              <label className={`w-full max-w-xs py-6 rounded-3xl font-black text-[10px] uppercase tracking-[0.4em] cursor-pointer transition-all shadow-xl flex items-center justify-center gap-4 active:scale-95 text-white ${activeTab === 'daily' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-black'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span>{isUploading ? 'VERIFYING...' : 'SELECT FILE'}</span>
                <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleUpload(e, activeTab as 'master' | 'daily')} disabled={isUploading} />
              </label>
              
              <div className="w-full max-w-lg min-h-[60px] flex flex-col items-center justify-center text-center space-y-3">
                {uploadError ? (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-2xl animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 justify-center">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                      {uploadError}
                    </p>
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                    {activeTab === 'daily' 
                      ? "MREP Daily Sales Line-Items only" 
                      : "Master Plan Budget Columns required"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
