import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { searchIssuesAll, getConfig } from '../jira-client';
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
          <line x1={todayX} y1={HEADER_HEIGHT - 8} x2={todayX} y2={HEADER_HEIGHT}
            stroke="#DE350B" strokeWidth="2" />
          <text x={todayX} y={HEADER_HEIGHT - 12} textAnchor="middle"
            fill="#DE350B" fontSize="9" fontWeight="600">Today</text>
        </g>
      )}
    </svg>
  );
}

function GanttBody({ tasks, months, dateRange, totalWidth, issueColors, todayX, onSelectIssue }) {
  const totalHeight = tasks.length * ROW_HEIGHT;

  const barX = (taskStart) => {
    const days = (new Date(taskStart) - dateRange.start) / (1000 * 60 * 60 * 24);
    return days * PX_PER_DAY;
  };

  const barW = (taskStart, taskEnd) => {
    const days = (new Date(taskEnd) - new Date(taskStart)) / (1000 * 60 * 60 * 24);
    return Math.max(days * PX_PER_DAY, MIN_BAR_W);
  };

  // Build month tick positions
  const monthTicks = [];
  let tx = 0;
  for (const m of months) {
    monthTicks.push(tx);
    tx += m.width;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={totalWidth}
      height={totalHeight}
      style={{ display: 'block' }}
    >
      {/* Grid rows */}
      {tasks.map((task, i) => {
        const y = i * ROW_HEIGHT;
        const isEven = i % 2 === 1;
        return (
          <g key={`row-${task.id}`}>
            <rect x={0} y={y} width={totalWidth} height={ROW_HEIGHT}
              fill={isEven ? '#FAFBFC' : '#fff'} />
            <line x1={0} y1={y + ROW_HEIGHT} x2={totalWidth} y2={y + ROW_HEIGHT}
              stroke="#F4F5F7" strokeWidth="1" />
          </g>
        );
      })}

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
      {tasks.map((task, i) => {
        const x = barX(task.start);
        const w = barW(task.start, task.end);
        const y = i * ROW_HEIGHT + BAR_V_OFFSET;
        const color = issueColors[task.id] || '#0052CC';
        const isDone = task.progress >= 100;
        return (
          <g key={`bar-${task.id}`}
            className="gantt-bar-group"
            onClick={() => onSelectIssue(task.id)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={y} width={w} height={BAR_HEIGHT} rx="3" ry="3"
              fill={isDone ? '#97A0AF' : color}
              className="gantt-bar"
            />
            <text x={x + w + 5} y={y + BAR_HEIGHT / 2}
              dominantBaseline="middle"
              fill="#172B4D" fontSize="11"
              className="gantt-bar-label"
            >{task.name}</text>
          </g>
        );
      })}
    </svg>
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
  const hscrollRef = useRef(null);

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

  const activeNames = useMemo(
    () => Object.entries(selectedComponents).filter(([, v]) => v).map(([k]) => k),
    [selectedComponents]
  );

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
      if (hideDone && i.status_category === 'Done') return false;
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
  }, [activeNames, issues, selectedComponents, allComponents, hideDone]);

  // Build task list for the Gantt
  const tasks = useMemo(() => {
    if (activeNames.length === 0) return [];
    const filtered = issues.filter(i => {
      if (hideDone && i.status_category === 'Done') return false;
      return i.components && i.components.some(c => selectedComponents[c.name]);
    });
    const sorted = [...filtered].sort((a, b) => {
      const sa = a.start_date || a.due_date || '';
      const sb = b.start_date || b.due_date || '';
      return sa.localeCompare(sb);
    });
    return sorted.map(issue => {
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
  }, [issues, selectedComponents, hideDone]);

  // Compute date range (padded to year boundaries)
  const dateRange = useMemo(() => {
    if (tasks.length === 0) return { start: new Date(), end: new Date() };
    let min = null, max = null;
    for (const t of tasks) {
      const s = new Date(t.start + 'T00:00:00');
      const e = new Date(t.end + 'T00:00:00');
      if (!min || s < min) min = s;
      if (!max || e > max) max = e;
    }
    min = new Date(min.getFullYear(), 0, 1);
    max = new Date(max.getFullYear() + 1, 0, 1);
    return { start: min, end: max };
  }, [tasks]);

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

  // Scroll to center today on mount / tasks change
  useEffect(() => {
    const el = hscrollRef.current;
    if (!el || tasks.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollLeft = todayX - el.clientWidth / 2;
    });
  }, [tasks, todayX]);

  if (loading) return <div className="timeline-empty">Loading DEV1 issues...</div>;
  if (error) return <div className="timeline-empty" style={{ color: '#DE350B' }}>Failed: {error}</div>;

  const compIssuesFor = (c) => (c.issues || []).sort((a, b) => {
    const sa = a.start_date || a.due_date || '';
    const sb = b.start_date || b.due_date || '';
    return sa.localeCompare(sb);
  });

  return (
    <div className="timeline-layout">
      <div className="timeline-sidebar">
        <div className="filter-section">
          <div className="filter-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Components</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={toggleExpandAll}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#0052CC', cursor: 'pointer', padding: '2px 4px' }}
              >{allExpanded ? 'Collapse all' : 'Expand all'}</button>
              <button
                onClick={toggleAll}
                style={{ background: 'none', border: 'none', fontSize: 10, color: '#0052CC', cursor: 'pointer', padding: '2px 4px' }}
              >{activeCount === allComponents.length ? 'Deselect all' : 'Select all'}</button>
            </div>
          </div>
          <div className="component-list">
            {allComponents.map((c, i) => {
              const baseColor = COMPONENT_COLORS[i % COMPONENT_COLORS.length];
              const checked = selectedComponents[c.name] || false;
              const expanded = expandedComponents[c.name] || false;
              const sortedIssues = compIssuesFor(c);
              return (
                <div key={c.name} className="comp-group">
                  <div className="comp-row">
                    <span className="comp-arrow" onClick={(e) => { e.stopPropagation(); toggleExpand(c.name); }}>
                      {expanded ? '▼' : '▶'}
                    </span>
                    <label className="comp-label">
                      <input type="checkbox" checked={checked}
                        onChange={e => setSelectedComponents({ ...selectedComponents, [c.name]: e.target.checked })} />
                      <span className="comp-color-dot" style={{ backgroundColor: baseColor }} />
                      <span className="comp-name">{c.name}</span>
                      <span className="component-count">{c.count}</span>
                    </label>
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
            {allComponents.length === 0 && <div style={{ padding: 8, fontSize: 11, color: '#6B778C' }}>No components found</div>}
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
              <span>{tasks.length} item{tasks.length !== 1 ? 's' : ''} across {activeNames.length} component{activeNames.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="timeline-gantt-wrap">
              <div className="timeline-gantt-hscroll" ref={hscrollRef}>
                <div className="timeline-gantt-inner">
                  <div className="gantt-header">
                    <GanttHeader months={months} years={years} totalWidth={totalWidth} todayX={todayX} />
                  </div>
                  <div className="timeline-gantt-body">
                    <GanttBody
                      tasks={tasks}
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
          </>
        )}
      </div>
    </div>
  );
}
