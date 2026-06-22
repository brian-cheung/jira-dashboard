import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { searchIssuesAll, getConfig } from '../jira-client';
import { getStatusColor, STATUS_ORDER } from './StatusBadge';
import './Timeline.css';

const COMPONENT_COLORS = [
  '#E67E22', '#8E44AD', '#2ECC71', '#E74C3C',
  '#1ABC9C', '#F39C12', '#3498DB', '#E91E63',
  '#00BCD4', '#FF5722', '#9C27B0', '#4CAF50',
  '#FF9800', '#673AB7', '#009688', '#F44336',
];

function shadeVariants(hex, count) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
    else if (max === gf) h = ((bf - rf) / d + 2) / 6;
    else h = ((rf - gf) / d + 4) / 6;
  }
  const variants = [];
  for (let i = 0; i < count; i++) {
    const offset = (i / (count - 1 || 1) - 0.5) * 0.5;
    const li = Math.max(0.08, Math.min(0.92, l + offset));
    const q = li < 0.5 ? li * (1 + s) : li + s - li * s;
    const p = 2 * li - q;
    const hue2rgb = (p1, q1, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p1 + (q1 - p1) * 6 * t;
      if (t < 1/2) return q1;
      if (t < 2/3) return p1 + (q1 - p1) * (2/3 - t) * 6;
      return p1;
    };
    const r2 = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const g2 = Math.round(hue2rgb(p, q, h) * 255);
    const b2 = Math.round(hue2rgb(p, q, h - 1/3) * 255);
    variants.push(`#${r2.toString(16).padStart(2,'0')}${g2.toString(16).padStart(2,'0')}${b2.toString(16).padStart(2,'0')}`);
  }
  return variants;
}

function parseTimelineIssue(issue) {
  const f = issue.fields || {};
  const cfg = getConfig();
  const startDateKey = cfg.startDateField || '';
  return {
    key: issue.key,
    summary: f.summary || '',
    status: f.status ? f.status.name : '',
    status_category: f.status && f.status.statusCategory ? f.status.statusCategory.name : '',
    start_date: startDateKey ? f[startDateKey] : null,
    due_date: f.duedate || null,
    issue_type: f.issuetype ? f.issuetype.name : '',
    components: (f.components || []).map(c => ({ id: c.id, name: c.name })),
  };
}

// ---- Gantt constants ----
const ROW_HEIGHT = 42;       // bar + padding
const BAR_HEIGHT = 24;
const BAR_V_OFFSET = 9;      // padding above bar within row
const HEADER_HEIGHT = 50;
const PX_PER_DAY = 4;        // 120 / 30
const MIN_BAR_W = 3;
const GROUP_HEADER_H = 28;   // height of component group separator row
const GROUP_LABEL_W = 280;   // reserved width for component name text

// ---- Gantt sub-components ----

function GanttHeader({ months, years, totalWidth, todayX }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={totalWidth}
      height={HEADER_HEIGHT}
      style={{ display: 'block' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={totalWidth} height={HEADER_HEIGHT} fill="#FAFBFC" />
      {/* Year labels */}
      {years.map(y => (
        <text
          key={`y-${y.year}`}
          x={y.x + y.width / 2}
          y={20}
          textAnchor="middle"
          fill="#6B778C"
          fontSize="11"
          fontWeight="600"
        >{y.year}</text>
      ))}
      {/* Month labels */}
      {months.map(m => (
        <text
          key={`m-${m.label}-${m.x}`}
          x={m.x + m.width / 2}
          y={42}
          textAnchor="middle"
          fill="#42526E"
          fontSize="10"
        >{m.label}</text>
      ))}
      {/* Tick lines between months */}
      {months.map((m, i) => (
        <line
          key={`tick-${i}`}
          x1={m.x} y1={HEADER_HEIGHT - 8}
          x2={m.x} y2={HEADER_HEIGHT}
          stroke="#DFE1E6"
          strokeWidth="1"
        />
      ))}
      {/* Today indicator in header */}
      {todayX != null && todayX >= 0 && todayX <= totalWidth && (
        <g>
          <line x1={todayX} y1={0} x2={todayX} y2={HEADER_HEIGHT}
            stroke="#DE350B" strokeWidth="2" />
          <rect x={todayX - 20} y={2} width={40} height={16} rx={3} fill="#DE350B" />
          <text x={todayX} y={14} textAnchor="middle"
            fill="#fff" fontSize="9" fontWeight="600">Today</text>
        </g>
      )}
    </svg>
  );
}

function GanttBody({ taskGroups, months, dateRange, totalWidth, issueColors, todayX, onSelectIssue, scrollTop }) {
  const rows = [];
  let y = 0;
  for (let g = 0; g < taskGroups.length; g++) {
    const group = taskGroups[g];
    rows.push({ type: 'header', groupIdx: g, y, color: group.color, name: group.compName, count: group.tasks.length });
    y += GROUP_HEADER_H;
    for (let t = 0; t < group.tasks.length; t++) {
      rows.push({ type: 'task', groupIdx: g, taskIdx: t, task: group.tasks[t], y });
      y += ROW_HEIGHT;
    }
  }
  const totalHeight = y;

  const barX = (taskStart) => {
    const days = (new Date(taskStart) - dateRange.start) / (1000 * 60 * 60 * 24);
    return days * PX_PER_DAY;
  };
  const barW = (taskStart, taskEnd) => {
    const days = (new Date(taskEnd) - new Date(taskStart)) / (1000 * 60 * 60 * 24);
    return Math.max(days * PX_PER_DAY, MIN_BAR_W);
  };

  const monthTicks = [];
  let tx = 0;
  for (const m of months) { monthTicks.push(tx); tx += m.width; }

  return (
    <div style={{ position: 'relative', width: totalWidth, height: totalHeight }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={totalWidth}
        height={totalHeight}
        style={{ display: 'block' }}
      >
        {/* Grid rows */}
        {rows.filter(r => r.type === 'task').map((r, i) => {
          const isEven = i % 2 === 1;
          return (
            <g key={`row-${r.task.id}-${r.groupIdx}`}>
              <rect x={0} y={r.y} width={totalWidth} height={ROW_HEIGHT}
                fill={isEven ? '#FAFBFC' : '#fff'} />
              <line x1={0} y1={r.y + ROW_HEIGHT} x2={totalWidth} y2={r.y + ROW_HEIGHT}
                stroke="#F4F5F7" strokeWidth="1" />
            </g>
          );
        })}

        {/* Group header background rows */}
        {rows.filter(r => r.type === 'header').map(r => (
          <g key={`group-hdr-${r.groupIdx}`}>
            <rect x={0} y={r.y} width={totalWidth} height={GROUP_HEADER_H}
              fill={r.color + '08'} />
            <line x1={0} y1={r.y + GROUP_HEADER_H} x2={totalWidth} y2={r.y + GROUP_HEADER_H}
              stroke={r.color + '20'} strokeWidth="1" />
          </g>
        ))}

        {/* Month tick lines */}
        {monthTicks.map((x, i) => (
          <line key={`mtick-${i}`} x1={x} y1={0} x2={x} y2={totalHeight}
            stroke={i % 3 === 0 ? '#DFE1E6' : '#F4F5F7'} strokeWidth="1" />
        ))}

        {/* Today line */}
        {todayX != null && todayX >= 0 && todayX <= totalWidth && (
          <g>
            <line x1={todayX} y1={0} x2={todayX} y2={totalHeight}
              stroke="#DE350B" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.7" />
            <circle cx={todayX} cy={4} r="4" fill="#DE350B" />
          </g>
        )}

        {/* Bars */}
        {rows.filter(r => r.type === 'task').map(r => {
          const task = r.task;
          const x = barX(task.start);
          const w = barW(task.start, task.end);
          const barY = r.y + BAR_V_OFFSET;
          const color = issueColors[task.id] || '#0052CC';
          const isDone = task.progress >= 100;
          return (
            <g key={`bar-${task.id}-${r.groupIdx}`}
              className="gantt-bar-group"
              onClick={() => onSelectIssue(task.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={x} y={barY} width={w} height={BAR_HEIGHT} rx="3" ry="3"
                fill={isDone ? '#97A0AF' : color}
                className="gantt-bar"
              />
              <text x={x + 2} y={barY - 2}
                fill="#42526E" fontSize="10"
                className="gantt-bar-label"
              >{task.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Group header labels overlay (fixed on the left, scrolls vertically with the body)
function GroupOverlay({ taskGroups }) {
  const rows = [];
  let y = 0;
  for (let g = 0; g < taskGroups.length; g++) {
    const group = taskGroups[g];
    rows.push({ type: 'header', groupIdx: g, y, color: group.color, name: group.compName, count: group.tasks.length });
    y += GROUP_HEADER_H;
    y += group.tasks.length * ROW_HEIGHT;
  }
  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>
      {rows.map(r => (
        <div key={`overlay-hdr-${r.groupIdx}`}
          style={{
            position: 'absolute', top: r.y, left: 0, right: 0,
            height: GROUP_HEADER_H,
            display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 14,
            background: r.color + '14', borderBottom: `1px solid ${r.color}35`,
            borderLeft: `4px solid ${r.color}`, boxSizing: 'border-box',
          }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#172B4D', whiteSpace: 'nowrap' }}>
            {r.name}
          </span>
          <span style={{ fontSize: 10, color: '#6B778C', flexShrink: 0 }}>
            {r.count} item{r.count !== 1 ? 's' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Date range slider (Excel pivot-table timeline style) ----

function DateRangeSlider({ minDate, maxDate, dateFrom, dateTo, onFromChange, onToChange }) {
  const barRef = useRef(null);

  const hasRange = minDate && maxDate;
  const totalDays = hasRange
    ? (new Date(maxDate + 'T00:00:00') - new Date(minDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)
    : 1;

  const fromPct = dateFrom
    ? ((new Date(dateFrom + 'T00:00:00') - new Date(minDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) / totalDays * 100
    : 0;
  const toPct = dateTo
    ? ((new Date(dateTo + 'T00:00:00') - new Date(minDate + 'T00:00:00')) / (1000 * 60 * 60 * 24)) / totalDays * 100
    : 100;

  const xToDate = useCallback((clientX) => {
    if (!barRef.current || !hasRange) return minDate;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const days = Math.round(pct * totalDays);
    const d = new Date(minDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }, [minDate, totalDays, hasRange]);

  const handleMouseDown = useCallback((e, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const date = xToDate(ev.clientX);
      if (handle === 'from') onFromChange(date);
      else onToChange(date);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [xToDate, onFromChange, onToChange]);

  const handleBarClick = useCallback((e) => {
    // Click on the bar outside handles — don't clear, just ignore
    // Only respond to handle drags
  }, []);

  const formatLabel = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  if (!hasRange) return null;

  return (
    <div className="date-slider">
      <div className="date-slider-bar" ref={barRef} onClick={handleBarClick}>
        <div className="date-slider-bg" />
        <div
          className="date-slider-fill"
          style={{ left: `${fromPct}%`, width: `${toPct - fromPct}%` }}
        />
        <div
          className="date-slider-handle date-slider-handle-left"
          style={{ left: `${fromPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, 'from')}
        />
        <div
          className="date-slider-handle date-slider-handle-right"
          style={{ left: `${toPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, 'to')}
        />
      </div>
      <div className="date-slider-labels">
        <span className="date-slider-label">{dateFrom ? formatLabel(dateFrom) : 'Start'}</span>
        <span className="date-slider-label">{dateTo ? formatLabel(dateTo) : 'End'}</span>
      </div>
    </div>
  );
}

// ---- Main Timeline component ----

export default function Timeline({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedComponents, setSelectedComponents] = useState({});
  const [expandedComponents, setExpandedComponents] = useState({});
  const [hideDone, setHideDone] = useState(false);
  const [search, setSearch] = useState('');
  const [componentOrder, setComponentOrder] = useState([]);
  const [dragComp, setDragComp] = useState(null);
  const [dragOverComp, setDragOverComp] = useState(null);
  const [statusFilter, setStatusFilter] = useState({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hiddenComponents, setHiddenComponents] = useState({});
  const dragCompRef = useRef(null);
  const savedExpandRef = useRef(null);
  const hscrollRef = useRef(null);
  const bodyRef = useRef(null);
  const overlayRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const jql = 'project = DEV1 AND component is not EMPTY ORDER BY created DESC';
    searchIssuesAll(jql).then(raw => {
      setIssues(raw.map(parseTimelineIssue));
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const allComponents = useMemo(() => {
    const map = {};
    for (const issue of issues) {
      for (const c of (issue.components || [])) {
        if (!map[c.name]) map[c.name] = { name: c.name, count: 0, issues: [] };
        map[c.name].count++;
        map[c.name].issues.push(issue);
      }
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [issues]);

  const sortedComponents = useMemo(() => {
    if (componentOrder.length === 0) return allComponents;
    const orderMap = {};
    componentOrder.forEach((name, i) => { orderMap[name] = i; });
    return [...allComponents].sort((a, b) => {
      const ai = orderMap[a.name] ?? 999;
      const bi = orderMap[b.name] ?? 999;
      return ai - bi;
    });
  }, [allComponents, componentOrder]);

  // Available statuses from all issues
  const availableStatuses = useMemo(() => {
    const seen = new Set();
    const statuses = [];
    for (const issue of issues) {
      const s = issue.status;
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        // Normalize to the canonical form from STATUS_ORDER
        const canonical = STATUS_ORDER.find(so => so.toLowerCase() === s.toLowerCase()) || s;
        statuses.push(canonical);
      }
    }
    return statuses.sort((a, b) => {
      const ai = STATUS_ORDER.findIndex(so => so.toLowerCase() === a.toLowerCase());
      const bi = STATUS_ORDER.findIndex(so => so.toLowerCase() === b.toLowerCase());
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [issues]);

  const activeStatusNames = useMemo(
    () => Object.entries(statusFilter).filter(([, v]) => v).map(([k]) => k.toLowerCase()),
    [statusFilter]
  );

  // Full date range across ALL issues (for the timeline slider bounds)
  const allIssuesDateRange = useMemo(() => {
    let min = null, max = null;
    for (const issue of issues) {
      const sd = issue.start_date ? issue.start_date.split('T')[0] : null;
      const ed = issue.due_date ? issue.due_date.split('T')[0] : null;
      const d = sd || ed;
      if (d) {
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return { min: min || '', max: max || '' };
  }, [issues]);

  // Helper: does an issue match all active filters?
  const issueMatchesFilters = useCallback((issue) => {
    if (hideDone && issue.status_category === 'Done') return false;
    if (activeStatusNames.length > 0 && !activeStatusNames.includes((issue.status || '').toLowerCase())) return false;
    const issueStart = issue.start_date ? issue.start_date.split('T')[0] : null;
    const issueEnd = issue.due_date ? issue.due_date.split('T')[0] : null;
    if (dateFrom) {
      const effEnd = issueEnd || issueStart;
      if (!effEnd || effEnd < dateFrom) return false;
    }
    if (dateTo) {
      const effStart = issueStart || issueEnd;
      if (!effStart || effStart > dateTo) return false;
    }
    return true;
  }, [hideDone, activeStatusNames, dateFrom, dateTo]);

  const filteredComponents = useMemo(() => {
    let components = search.trim() ? (() => {
      const q = search.toLowerCase();
      return sortedComponents.filter(c => {
        if (c.name.toLowerCase().includes(q)) return true;
        return c.issues.some(i =>
          i.key.toLowerCase().includes(q) ||
          (i.summary || '').toLowerCase().includes(q)
        );
      });
    })() : sortedComponents;

    // Filter by status/date/done — only keep components with matching issues
    if (activeStatusNames.length > 0 || dateFrom || dateTo || hideDone) {
      components = components.map(c => {
        const matchingIssues = c.issues.filter(issueMatchesFilters);
        if (matchingIssues.length === 0) return null;
        return { ...c, issues: matchingIssues, count: matchingIssues.length };
      }).filter(Boolean);
    }

    return components;
  }, [sortedComponents, search, activeStatusNames, dateFrom, dateTo, hideDone, issueMatchesFilters]);

  // Auto-expand matching components when searching
  useEffect(() => {
    if (!search.trim()) {
      if (savedExpandRef.current) {
        setExpandedComponents(savedExpandRef.current);
        savedExpandRef.current = null;
      }
      return;
    }
    if (!savedExpandRef.current) {
      savedExpandRef.current = { ...expandedComponents };
    }
    const q = search.toLowerCase();
    const toExpand = {};
    sortedComponents.forEach(c => {
      if (
        c.name.toLowerCase().includes(q) ||
        c.issues.some(i => i.key.toLowerCase().includes(q) || (i.summary || '').toLowerCase().includes(q))
      ) {
        toExpand[c.name] = true;
      }
    });
    setExpandedComponents(prev => ({ ...prev, ...toExpand }));
  }, [search]);

  const activeNames = useMemo(() => {
    const names = Object.entries(selectedComponents)
      .filter(([, v]) => v)
      .filter(([k]) => !hiddenComponents[k])
      .map(([k]) => k);
    if (componentOrder.length === 0) return names;
    const orderMap = {};
    componentOrder.forEach((name, i) => { orderMap[name] = i; });
    return names.sort((a, b) => (orderMap[a] ?? 999) - (orderMap[b] ?? 999));
  }, [selectedComponents, componentOrder, hiddenComponents]);

  const activeCount = activeNames.length;
  const expandedCount = Object.values(expandedComponents).filter(Boolean).length;
  const allExpanded = expandedCount === allComponents.length && allComponents.length > 0;

  const toggleAll = useCallback(() => {
    if (activeCount === allComponents.length && allComponents.length > 0) {
      setSelectedComponents({});
    } else {
      const all = {};
      allComponents.forEach(c => { all[c.name] = true; });
      setSelectedComponents(all);
    }
  }, [activeCount, allComponents]);

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedComponents({});
    } else {
      const all = {};
      allComponents.forEach(c => { all[c.name] = true; });
      setExpandedComponents(all);
    }
  }, [allExpanded, allComponents]);

  const toggleExpand = useCallback((name) => {
    setExpandedComponents(prev => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const SHADE_COUNT = 5;

  const issueColors = useMemo(() => {
    if (activeNames.length === 0) return {};
    const colors = {};
    const filtered = issues.filter(i => {
      if (!issueMatchesFilters(i)) return false;
      return i.components && i.components.some(c => selectedComponents[c.name]);
    });
    const byComp = {};
    for (const issue of filtered) {
      const compName = (issue.components || []).find(c => selectedComponents[c.name])?.name || '';
      if (!byComp[compName]) byComp[compName] = [];
      byComp[compName].push(issue);
    }
    for (const [compName, compIssues] of Object.entries(byComp)) {
      const sorted = compIssues.sort((a, b) => {
        const sa = a.start_date || a.due_date || '';
        const sb = b.start_date || b.due_date || '';
        return sa.localeCompare(sb);
      });
      const ci = allComponents.findIndex(c => c.name === compName);
      const base = COMPONENT_COLORS[ci >= 0 ? ci % COMPONENT_COLORS.length : 0];
      const shades = shadeVariants(base, SHADE_COUNT);
      for (let idx = 0; idx < sorted.length; idx++) {
        const issue = sorted[idx];
        colors[issue.key] = issue.status_category === 'Done' ? '#97A0AF' : shades[idx % SHADE_COUNT];
      }
    }
    return colors;
  }, [activeNames, issues, selectedComponents, allComponents, issueMatchesFilters]);

  // Build task groups for the Gantt (grouped by component when multiple selected)
  const taskGroups = useMemo(() => {
    if (activeNames.length === 0) return [];
    const groups = [];
    for (const compName of activeNames) {
      const filtered = issues.filter(i => {
        if (!issueMatchesFilters(i)) return false;
        return i.components && i.components.some(c => c.name === compName);
      });
      if (filtered.length === 0) continue;
      const sorted = [...filtered].sort((a, b) => {
        const sa = a.start_date || a.due_date || '';
        const sb = b.start_date || b.due_date || '';
        return sa.localeCompare(sb);
      });
      const ci = allComponents.findIndex(c => c.name === compName);
      const color = COMPONENT_COLORS[ci >= 0 ? ci % COMPONENT_COLORS.length : 0];
      const tasks = sorted.map(issue => {
        const startRaw = issue.start_date || issue.due_date || '';
        const endRaw = issue.due_date || issue.start_date || '';
        return {
          id: issue.key,
          name: `${issue.key}: ${issue.summary}`,
          start: startRaw.split('T')[0],
          end: endRaw.split('T')[0],
          progress: issue.status_category === 'Done' ? 100 : 0,
        };
      }).filter(t => t.start && t.end);
      if (tasks.length > 0) {
        groups.push({ compName, color, tasks });
      }
    }
    return groups;
  }, [issues, selectedComponents, activeNames, allComponents, issueMatchesFilters]);

  const totalTaskCount = useMemo(
    () => taskGroups.reduce((s, g) => s + g.tasks.length, 0),
    [taskGroups]
  );

  // Compute date range (padded to year boundaries)
  const dateRange = useMemo(() => {
    if (taskGroups.length === 0) return { start: new Date(), end: new Date() };
    let min = null, max = null;
    for (const g of taskGroups) {
      for (const t of g.tasks) {
        const s = new Date(t.start + 'T00:00:00');
        const e = new Date(t.end + 'T00:00:00');
        if (!min || s < min) min = s;
        if (!max || e > max) max = e;
      }
    }
    min = new Date(min.getFullYear(), 0, 1);
    max = new Date(max.getFullYear() + 1, 0, 1);
    return { start: min, end: max };
  }, [taskGroups]);

  // Build month array with positions
  const months = useMemo(() => {
    const result = [];
    let x = 0;
    const d = new Date(dateRange.start);
    while (d < dateRange.end) {
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const width = daysInMonth * PX_PER_DAY;
      result.push({
        label: d.toLocaleString('default', { month: 'short' }),
        year,
        x,
        width,
        daysInMonth,
      });
      x += width;
      d.setMonth(d.getMonth() + 1);
    }
    return result;
  }, [dateRange]);

  // Build year label positions
  const years = useMemo(() => {
    const result = [];
    let lastYear = null;
    for (const m of months) {
      if (m.year !== lastYear) {
        const yearMonths = months.filter(mm => mm.year === m.year);
        const totalWidth = yearMonths.reduce((s, mm) => s + mm.width, 0);
        result.push({ year: m.year, x: m.x, width: totalWidth });
        lastYear = m.year;
      }
    }
    return result;
  }, [months]);

  // Total chart width
  const totalWidth = useMemo(() => {
    return months.reduce((s, m) => s + m.width, 0);
  }, [months]);

  // Today X position
  const todayX = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = (today - dateRange.start) / (1000 * 60 * 60 * 24);
    return days * PX_PER_DAY;
  }, [dateRange]);

  // Scroll to center today on mount / taskGroups change
  useEffect(() => {
    const el = hscrollRef.current;
    if (!el || taskGroups.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollLeft = todayX - el.clientWidth / 2;
    });
  }, [taskGroups, todayX]);

  const handleDragStart = useCallback((e, compName) => {
    dragCompRef.current = compName;
    setDragComp(compName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', compName);
  }, []);

  const handleDragOver = useCallback((e, compName) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverComp(prev => prev === compName ? prev : compName);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverComp(null);
    }
  }, []);

  const handleDrop = useCallback((e, targetName) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverComp(null);
    setDragComp(null);
    const sourceComp = dragCompRef.current;
    dragCompRef.current = null;
    if (!sourceComp || sourceComp === targetName) return;
    const allNames = allComponents.map(c => c.name);
    const baseOrder = componentOrder.length > 0 ? componentOrder : allNames;
    const newOrder = baseOrder.filter(n => allNames.includes(n));
    for (const n of allNames) {
      if (!newOrder.includes(n)) newOrder.push(n);
    }
    const fromIdx = newOrder.indexOf(sourceComp);
    const toIdx = newOrder.indexOf(targetName);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceComp);
    setComponentOrder(newOrder);
  }, [allComponents, componentOrder]);

  const handleDragEnd = useCallback(() => {
    setDragOverComp(null);
    setDragComp(null);
    dragCompRef.current = null;
  }, []);

  const resetOrder = useCallback(() => {
    setComponentOrder([]);
  }, []);

  const toggleHideComponent = useCallback((name) => {
    setHiddenComponents(prev => {
      const next = { ...prev, [name]: !prev[name] };
      if (next[name]) {
        // Also uncheck from selected when hiding
        setSelectedComponents(sc => ({ ...sc, [name]: false }));
      }
      return next;
    });
  }, []);

  const unhideAll = useCallback(() => {
    setHiddenComponents({});
  }, []);

  const resetAll = useCallback(() => {
    setSearch('');
    setStatusFilter({});
    setDateFrom('');
    setDateTo('');
    setHiddenComponents({});
    setHideDone(false);
    setComponentOrder([]);
  }, []);

  const hiddenCount = Object.values(hiddenComponents).filter(Boolean).length;

  const exportGanttPNG = useCallback(() => {
    const headerSvg = document.querySelector('.gantt-header svg');
    const bodySvg = document.querySelector('.timeline-gantt-body svg');
    if (!bodySvg || taskGroups.length === 0) return;

    // Compute tight date range from actual items (not year-padded)
    let dMin = null, dMax = null;
    for (const g of taskGroups) {
      for (const t of g.tasks) {
        const s = new Date(t.start + 'T00:00:00');
        const e = new Date(t.end + 'T00:00:00');
        if (!dMin || s < dMin) dMin = s;
        if (!dMax || e > dMax) dMax = e;
      }
    }
    if (!dMin) return;
    const padDays = 14;
    dMin = new Date(dMin); dMin.setDate(dMin.getDate() - padDays);
    dMax = new Date(dMax); dMax.setDate(dMax.getDate() + padDays);
    const exportDays = (dMax - dMin) / (1000 * 60 * 60 * 24);
    let exportW = Math.ceil(exportDays * PX_PER_DAY);

    // Pad right side so full task titles are visible in export
    for (const g of taskGroups) {
      for (const t of g.tasks) {
        const barEndX = ((new Date(t.end + 'T00:00:00') - dMin) / (1000 * 60 * 60 * 24)) * PX_PER_DAY;
        const textW = t.name.length * 6 + 4;
        const textEnd = barEndX + textW;
        if (textEnd > exportW) exportW = Math.ceil(textEnd);
      }
    }

    const headerH = headerSvg ? parseInt(headerSvg.getAttribute('height') || '50') : HEADER_HEIGHT;
    const bodyH = parseInt(bodySvg.getAttribute('height') || '600');
    const totalH = headerH + bodyH;

    const bodyClone = bodySvg.cloneNode(true);
    const svgNS = 'http://www.w3.org/2000/svg';
    const combined = document.createElementNS(svgNS, 'svg');
    combined.setAttribute('xmlns', svgNS);
    combined.setAttribute('width', exportW);
    combined.setAttribute('height', totalH);
    combined.setAttribute('viewBox', `0 0 ${exportW} ${totalH}`);

    // Font styles so canvas renders text correctly
    const style = document.createElementNS(svgNS, 'style');
    style.textContent = `text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }`;
    combined.appendChild(style);

    // White background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#fff');
    combined.appendChild(bg);

    // Rebuild header for the export date range
    const hdrG = document.createElementNS(svgNS, 'g');
    // Header background
    const hdrBg = document.createElementNS(svgNS, 'rect');
    hdrBg.setAttribute('width', exportW); hdrBg.setAttribute('height', headerH);
    hdrBg.setAttribute('fill', '#FAFBFC');
    hdrG.appendChild(hdrBg);
    // Month ticks and labels
    const cur = new Date(dMin);
    cur.setDate(1);
    let tickX = 0;
    let yearStartX = 0;
    let yearWidth = 0;
    let yearTrack = cur.getFullYear();
    while (cur < dMax) {
      const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
      const mW = daysInMonth * PX_PER_DAY;
      // Label
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', tickX + mW / 2);
      label.setAttribute('y', '42');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#42526E');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      label.textContent = cur.toLocaleString('default', { month: 'short' });
      hdrG.appendChild(label);
      // Year span tracking — flush label at year boundary (skip first month)
      if (cur.getMonth() === 0 && tickX > 0) {
        const prevYr = document.createElementNS(svgNS, 'text');
        prevYr.setAttribute('x', yearStartX + yearWidth / 2);
        prevYr.setAttribute('y', '20');
        prevYr.setAttribute('text-anchor', 'middle');
        prevYr.setAttribute('fill', '#6B778C');
        prevYr.setAttribute('font-size', '11');
        prevYr.setAttribute('font-weight', '600');
        prevYr.textContent = yearTrack;
        hdrG.appendChild(prevYr);
        yearStartX = tickX;
        yearWidth = 0;
        yearTrack = cur.getFullYear();
      }
      yearWidth += mW;
      // Tick line
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', tickX); tick.setAttribute('y1', headerH - 8);
      tick.setAttribute('x2', tickX); tick.setAttribute('y2', headerH);
      tick.setAttribute('stroke', '#DFE1E6'); tick.setAttribute('stroke-width', '1');
      hdrG.appendChild(tick);
      tickX += mW;
      cur.setMonth(cur.getMonth() + 1);
    }
    // Flush final year label
    const finalYr = document.createElementNS(svgNS, 'text');
    finalYr.setAttribute('x', yearStartX + yearWidth / 2);
    finalYr.setAttribute('y', '20');
    finalYr.setAttribute('text-anchor', 'middle');
    finalYr.setAttribute('fill', '#6B778C');
    finalYr.setAttribute('font-size', '11');
    finalYr.setAttribute('font-weight', '600');
    finalYr.textContent = yearTrack;
    hdrG.appendChild(finalYr);
    // Today line if in range
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (today >= dMin && today <= dMax) {
      const todayExportX = ((today - dMin) / (1000 * 60 * 60 * 24)) * PX_PER_DAY;
      const tl = document.createElementNS(svgNS, 'line');
      tl.setAttribute('x1', todayExportX); tl.setAttribute('y1', 0);
      tl.setAttribute('x2', todayExportX); tl.setAttribute('y2', headerH);
      tl.setAttribute('stroke', '#DE350B'); tl.setAttribute('stroke-width', '2');
      hdrG.appendChild(tl);
      const tb = document.createElementNS(svgNS, 'rect');
      tb.setAttribute('x', todayExportX - 20); tb.setAttribute('y', 2);
      tb.setAttribute('width', 40); tb.setAttribute('height', 16);
      tb.setAttribute('rx', 3); tb.setAttribute('fill', '#DE350B');
      hdrG.appendChild(tb);
      const tt = document.createElementNS(svgNS, 'text');
      tt.setAttribute('x', todayExportX); tt.setAttribute('y', 14);
      tt.setAttribute('text-anchor', 'middle');
      tt.setAttribute('fill', '#fff'); tt.setAttribute('font-size', '9');
      tt.setAttribute('font-weight', '600');
      tt.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      tt.textContent = 'Today';
      hdrG.appendChild(tt);
    }
    combined.appendChild(hdrG);

    // Shift body into the export date window and below header
    const bodyShiftX = ((dMin - dateRange.start) / (1000 * 60 * 60 * 24)) * PX_PER_DAY;
    const bodyG = document.createElementNS(svgNS, 'g');
    bodyG.setAttribute('transform', `translate(${-bodyShiftX}, ${headerH})`);
    // Add font-family to all text in body
    bodyClone.querySelectorAll('text').forEach(t => {
      t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    });
    while (bodyClone.firstChild) {
      bodyG.appendChild(bodyClone.firstChild);
    }
    combined.appendChild(bodyG);

    // Render component group header labels into the export SVG
    let gy = headerH;
    for (let g = 0; g < taskGroups.length; g++) {
      const group = taskGroups[g];
      const ghdr = document.createElementNS(svgNS, 'g');
      // Background strip
      const gr = document.createElementNS(svgNS, 'rect');
      gr.setAttribute('x', 0); gr.setAttribute('y', gy);
      gr.setAttribute('width', exportW); gr.setAttribute('height', GROUP_HEADER_H);
      gr.setAttribute('fill', group.color + '08');
      ghdr.appendChild(gr);
      // Left border accent
      const gb = document.createElementNS(svgNS, 'rect');
      gb.setAttribute('x', 0); gb.setAttribute('y', gy);
      gb.setAttribute('width', 4); gb.setAttribute('height', GROUP_HEADER_H);
      gb.setAttribute('fill', group.color);
      ghdr.appendChild(gb);
      // Bottom separator line
      const gl = document.createElementNS(svgNS, 'line');
      gl.setAttribute('x1', 0); gl.setAttribute('y1', gy + GROUP_HEADER_H);
      gl.setAttribute('x2', exportW); gl.setAttribute('y2', gy + GROUP_HEADER_H);
      gl.setAttribute('stroke', group.color + '20'); gl.setAttribute('stroke-width', '1');
      ghdr.appendChild(gl);
      // Title text
      const gt = document.createElementNS(svgNS, 'text');
      gt.setAttribute('x', 14); gt.setAttribute('y', gy + GROUP_HEADER_H / 2 + 4);
      gt.setAttribute('fill', '#172B4D'); gt.setAttribute('font-size', '12');
      gt.setAttribute('font-weight', '600');
      gt.textContent = group.compName;
      ghdr.appendChild(gt);
      // Item count
      const gc = document.createElementNS(svgNS, 'text');
      gc.setAttribute('x', 14 + gt.textContent.length * 7.2 + 10);
      gc.setAttribute('y', gy + GROUP_HEADER_H / 2 + 4);
      gc.setAttribute('fill', '#6B778C'); gc.setAttribute('font-size', '10');
      gc.textContent = group.tasks.length + ' item' + (group.tasks.length !== 1 ? 's' : '');
      ghdr.appendChild(gc);
      combined.appendChild(ghdr);
      gy += GROUP_HEADER_H;
      gy += group.tasks.length * ROW_HEIGHT;
    }

    // Render to canvas
    const svgStr = new XMLSerializer().serializeToString(combined);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = exportW * scale;
      canvas.height = totalH * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, exportW, totalH);
      ctx.drawImage(img, 0, 0, exportW, totalH);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'gantt-chart.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = url;
  }, [taskGroups, dateRange]);

  const compIssuesFor = useCallback((c) => (c.issues || []).sort((a, b) => {
    const sa = a.start_date || a.due_date || '';
    const sb = b.start_date || b.due_date || '';
    return sa.localeCompare(sb);
  }), []);

  // Sort: visible components first, hidden at bottom
  const displayComponents = useMemo(() => {
    const visible = [];
    const hidden = [];
    for (const c of filteredComponents) {
      if (hiddenComponents[c.name]) hidden.push(c);
      else visible.push(c);
    }
    return [...visible, ...hidden];
  }, [filteredComponents, hiddenComponents]);

  if (loading) return <div className="timeline-empty">Loading DEV1 issues...</div>;
  if (error) return <div className="timeline-empty" style={{ color: '#DE350B' }}>Failed: {error}</div>;

  return (
    <div className="timeline-layout">
      <div className="timeline-sidebar">
        <div className="filter-section">
          <div className="filter-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Components</span>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {hiddenCount > 0 && (
                <button
                  onClick={unhideAll}
                  style={{ background: 'none', border: 'none', fontSize: 10, color: '#6B778C', cursor: 'pointer', padding: '2px 4px' }}
                  title="Show all hidden components"
                >Show all</button>
              )}
              <button
                onClick={toggleExpandAll}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#0052CC', cursor: 'pointer', padding: '2px 4px' }}
              >{allExpanded ? 'Collapse all' : 'Expand all'}</button>
              <button
                onClick={toggleAll}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#0052CC', cursor: 'pointer', padding: '2px 4px' }}
              >{activeCount === allComponents.length ? 'Deselect all' : 'Select all'}</button>
              <button
                onClick={resetAll}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#6B778C', cursor: 'pointer', padding: '2px 4px' }}
                title="Reset all filters"
              >Reset</button>
            </div>
          </div>
          <div className="timeline-search-wrap">
            <input
              type="text"
              className="timeline-search-input"
              placeholder="Filter components..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="timeline-search-clear" onClick={() => setSearch('')}>&times;</button>
            )}
          </div>

          {/* Status filter pills */}
          {availableStatuses.length > 0 && (
            <div className="timeline-filter-row">
              <div className="timeline-filter-label">Status</div>
              <div className="timeline-status-chips">
                {availableStatuses.map(s => {
                  const active = statusFilter[s] || false;
                  const sc = getStatusColor(s);
                  return (
                    <button
                      key={s}
                      className={`timeline-status-chip${active ? ' active' : ''}`}
                      style={active ? { backgroundColor: sc.bg, borderColor: sc.border, color: sc.text } : {}}
                      onClick={() => setStatusFilter(prev => ({ ...prev, [s]: !prev[s] }))}
                    >{s}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date range — Excel pivot-table timeline style */}
          <div className="timeline-filter-row">
            <div className="timeline-filter-label">
              Date
              {(dateFrom || dateTo) && (
                <button
                  className="timeline-date-clear"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  title="Clear date filter"
                >&times;</button>
              )}
            </div>
            <DateRangeSlider
              minDate={allIssuesDateRange.min}
              maxDate={allIssuesDateRange.max}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
            />
          </div>

          <div className="component-list">
            {displayComponents.map((c, i) => {
              const baseColor = COMPONENT_COLORS[i % COMPONENT_COLORS.length];
              const checked = selectedComponents[c.name] || false;
              const expanded = expandedComponents[c.name] || false;
              const sortedIssues = compIssuesFor(c);
              const isDragOver = dragOverComp === c.name;
              const isSearching = !!search.trim();
              const filteredCount = c.count;
              const totalCount = allComponents.find(ac => ac.name === c.name)?.count || c.count;
              const isHidden = hiddenComponents[c.name] || false;
              return (
                <div key={c.name}
                  className={`comp-group${isDragOver ? ' comp-group-drop-target' : ''}${isHidden ? ' comp-group-hidden' : ''}`}
                  onDragOver={(e) => handleDragOver(e, c.name)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, c.name)}
                >
                  <div className={`comp-row${dragComp === c.name ? ' comp-row-dragging' : ''}`}>
                    <span
                      className={`comp-drag-handle${isSearching || isHidden ? ' comp-drag-handle-disabled' : ''}`}
                      draggable={!isSearching && !isHidden}
                      onDragStart={(e) => handleDragStart(e, c.name)}
                      onDragEnd={handleDragEnd}
                      title={isHidden ? 'Unhide to reorder' : isSearching ? 'Clear search to reorder' : 'Drag to reorder'}
                    >⋮⋮</span>
                    <span className="comp-arrow" onClick={(e) => { e.stopPropagation(); toggleExpand(c.name); }}>
                      {expanded ? '▼' : '▶'}
                    </span>
                    <label className="comp-label">
                      <input type="checkbox" checked={checked}
                        disabled={isHidden}
                        onChange={e => setSelectedComponents({ ...selectedComponents, [c.name]: e.target.checked })} />
                      <span className="comp-color-dot" style={{ backgroundColor: isHidden ? '#C1C7D0' : baseColor }} />
                      <span className={`comp-name${isHidden ? ' comp-name-hidden' : ''}`}>{c.name}</span>
                      <span className="component-count">
                        {filteredCount !== totalCount ? `${filteredCount}/${totalCount}` : totalCount}
                      </span>
                    </label>
                    <button
                      className={`comp-hide-btn${isHidden ? ' comp-hide-btn-hidden' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleHideComponent(c.name); }}
                      title={isHidden ? 'Show component' : 'Hide component'}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                        {isHidden && <line x1="2" y1="2" x2="22" y2="22" />}
                      </svg>
                    </button>
                  </div>
                  {expanded && (
                    <div className="comp-issues">
                      {sortedIssues.map(issue => (
                        <div key={issue.key} className="comp-issue-item"
                          onClick={() => onSelectIssue(issue.key)}>
                          <span className="comp-issue-color" style={{ backgroundColor: issueColors[issue.key] || baseColor }} />
                          <span className="comp-issue-key">{issue.key}</span>
                          <span className="comp-issue-summary">{issue.summary}</span>
                          <span className="comp-issue-date">
                            {issue.start_date ? issue.start_date.split('T')[0] : (issue.due_date ? issue.due_date.split('T')[0] : '-')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {displayComponents.length === 0 && <div style={{ padding: 8, fontSize: 11, color: '#6B778C' }}>No components found</div>}
          </div>
        </div>
        <div className="filter-section">
          <label className="timeline-done-toggle">
            <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
            Hide done items
          </label>
        </div>
      </div>
      <div className="timeline-main">
        {activeNames.length === 0 ? (
          <div className="timeline-empty">Select one or more components to view the timeline.</div>
        ) : (
          <>
            <div className="timeline-header">
              <span>{totalTaskCount} item{totalTaskCount !== 1 ? 's' : ''} across {taskGroups.length} component{taskGroups.length !== 1 ? 's' : ''}</span>
              <button className="timeline-export-btn" onClick={exportGanttPNG} title="Export Gantt chart as PNG">
                Export PNG
              </button>
            </div>
            <div className="timeline-gantt-wrap">
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Sticky group label overlay — sits on top of the scrollable area, doesn't scroll horizontally */}
                {taskGroups.length > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: HEADER_HEIGHT, bottom: 0,
                    zIndex: 10, overflow: 'hidden',
                    background: 'transparent', pointerEvents: 'none',
                  }} ref={overlayRef}>
                    <div style={{ transform: `translateY(-${scrollTop}px)` }}>
                      <GroupOverlay taskGroups={taskGroups} />
                    </div>
                  </div>
                )}
                <div className="timeline-gantt-hscroll" ref={hscrollRef}>
                  <div className="timeline-gantt-inner">
                    <div className="gantt-header">
                      <GanttHeader months={months} years={years} totalWidth={totalWidth} todayX={todayX} />
                    </div>
                    <div className="timeline-gantt-body" ref={bodyRef}
                      onScroll={(e) => setScrollTop(e.target.scrollTop)}>
                      <GanttBody
                        taskGroups={taskGroups}
                        months={months}
                        dateRange={dateRange}
                        totalWidth={totalWidth}
                        issueColors={issueColors}
                        todayX={todayX}
                        onSelectIssue={onSelectIssue}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
