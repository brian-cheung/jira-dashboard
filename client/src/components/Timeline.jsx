import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Gantt from 'frappe-gantt';
import { searchIssuesAll, getConfig } from '../jira-client';
import './Timeline.css';

const COMPONENT_COLORS = [
  '#E67E22', '#8E44AD', '#2ECC71', '#E74C3C',
  '#1ABC9C', '#F39C12', '#3498DB', '#E91E63',
  '#00BCD4', '#FF5722', '#9C27B0', '#4CAF50',
  '#FF9800', '#673AB7', '#009688', '#F44336',
];

// Generate shade variations (lighter/darker) from a base hex color
function shadeVariants(hex, count) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Convert to HSL
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

  // Generate variations with different lightness levels
  const variants = [];
  for (let i = 0; i < count; i++) {
    const offset = (i / (count - 1 || 1) - 0.5) * 0.5; // spread from -0.25 to +0.25
    const li = Math.max(0.08, Math.min(0.92, l + offset));
    const hslToRgb = (h1, s1, l1) => {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
      const p = 2 * l1 - q;
      const r2 = Math.round(hue2rgb(p, q, h1 + 1/3) * 255);
      const g2 = Math.round(hue2rgb(p, q, h1) * 255);
      const b2 = Math.round(hue2rgb(p, q, h1 - 1/3) * 255);
      return `#${r2.toString(16).padStart(2, '0')}${g2.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
    };
    variants.push(hslToRgb(h, s, li));
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

export default function Timeline({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedComponents, setSelectedComponents] = useState({});
  const [expandedComponents, setExpandedComponents] = useState({});
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

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

  const toggleAll = useCallback(() => {
    if (activeCount === allComponents.length && allComponents.length > 0) {
      setSelectedComponents({});
    } else {
      const all = {};
      allComponents.forEach(c => { all[c.name] = true; });
      setSelectedComponents(all);
    }
  }, [activeCount, allComponents]);

  const toggleExpand = useCallback((name) => {
    setExpandedComponents(prev => ({ ...prev, [name]: !prev[name] }));
  }, []);

  // Shared issue→color map used by both Gantt bars and sidebar issue dots
  const SHADE_COUNT = 5;

  const issueColors = useMemo(() => {
    if (activeNames.length === 0) return {};

    const colors = {}; // issue.key → color

    const filtered = issues.filter(i =>
      i.components && i.components.some(c => selectedComponents[c.name])
    );

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
        colors[issue.key] = issue.status_category === 'Done'
          ? '#97A0AF'
          : shades[idx % SHADE_COUNT];
      }
    }

    return colors;
  }, [activeNames, issues, selectedComponents, allComponents]);

  const tasks = useMemo(() => {
    if (activeNames.length === 0) return [];

    const filtered = issues.filter(i =>
      i.components && i.components.some(c => selectedComponents[c.name])
    );

    const sorted = [...filtered].sort((a, b) => {
      const sa = a.start_date || a.due_date || '';
      const sb = b.start_date || b.due_date || '';
      return sa.localeCompare(sb);
    });

    return sorted.map(issue => {
      const start = issue.start_date || issue.due_date || '';
      const end = issue.due_date || issue.start_date || '';
      const done = issue.status_category === 'Done';

      return {
        id: issue.key,
        name: `${issue.key}: ${issue.summary}`,
        start: start.split('T')[0],
        end: end.split('T')[0],
        progress: done ? 100 : 0,
        dependencies: '',
      };
    }).filter(t => t.start && t.end);
  }, [issues, selectedComponents]);

  // Inject CSS for bar colors
  useEffect(() => {
    const styleId = 'gantt-comp-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const rules = [];
    for (const [key, color] of Object.entries(issueColors)) {
      // Use data-id attribute selector to target the bar
      rules.push(`.bar-wrapper[data-id="${key}"] .bar { fill: ${color} !important; }`);
    }
    styleEl.textContent = rules.join('\n');

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.textContent = '';
    };
  }, [issueColors]);

  // Render Gantt
  useEffect(() => {
    if (!containerRef.current || tasks.length === 0) {
      if (ganttRef.current) { ganttRef.current = null; }
      return;
    }

    containerRef.current.innerHTML = '';

    try {
      ganttRef.current = new Gantt(containerRef.current, tasks, {
        view_mode: 'Month',
        date_format: 'YYYY-MM-DD',
        bar_height: 24,
        padding: 18,
        on_click: (task) => {
          onSelectIssue(task.id);
        },
        custom_popup_html: (task) => {
          return `<div class="gantt-popup"><strong>${task.id}</strong><br/>${task.name}<br/>Progress: ${task.progress}%</div>`;
        }
      });

      // Apply colors, position labels, and draw today line
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const wrappers = containerRef.current.querySelectorAll('.bar-wrapper');
        const svg = containerRef.current.querySelector('svg');
        for (const w of wrappers) {
          const taskId = w.getAttribute('data-id');
          const color = taskId && issueColors[taskId];
          if (color) {
            const bar = w.querySelector('.bar');
            if (bar) bar.style.fill = color;
          }
          // Move label to after the bar
          const label = w.querySelector('.bar-label');
          const bar = w.querySelector('.bar');
          if (label && bar) {
            const barX = parseFloat(bar.getAttribute('x') || 0);
            const barW = parseFloat(bar.getAttribute('width') || 0);
            label.setAttribute('x', barX + barW + 5);
            label.classList.add('big');
          }
        }

        // Draw today line using Gantt instance's internal date math
        if (!svg || !ganttRef.current) return;
        const gantt = ganttRef.current;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(gantt.gantt_start);
        start.setHours(0, 0, 0, 0);
        const hoursSinceStart = (today - start) / (1000 * 60 * 60);
        const todayX = (hoursSinceStart / gantt.options.step) * gantt.options.column_width;

        // Get SVG height from viewBox or computed size
        const viewBox = svg.getAttribute('viewBox');
        const totalH = viewBox
          ? parseFloat(viewBox.split(' ')[3])
          : parseFloat(svg.getAttribute('height') || '500');

        let line = document.getElementById('today-line');
        if (!line) {
          line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.id = 'today-line';
          line.setAttribute('stroke', '#DE350B');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '6,3');
          svg.appendChild(line);
        }
        line.setAttribute('x1', todayX);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', todayX);
        line.setAttribute('y2', totalH || 500);
      });
    } catch (e) {
      console.error('Gantt render error:', e);
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      ganttRef.current = null;
    };
  }, [tasks, issueColors]);

  if (loading) return <div className="timeline-empty">Loading DEV1 issues...</div>;
  if (error) return <div className="timeline-empty" style={{ color: '#DE350B' }}>Failed: {error}</div>;

  return (
    <div className="timeline-layout">
      <div className="timeline-sidebar">
        <div className="filter-section">
          <div className="filter-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Components</span>
            <button
              onClick={toggleAll}
              style={{ background: 'none', border: 'none', fontSize: 10, color: '#0052CC', cursor: 'pointer', padding: '2px 4px' }}
            >
              {activeCount === allComponents.length && allComponents.length > 0 ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="component-list">
            {allComponents.map((c, i) => {
              const baseColor = COMPONENT_COLORS[i % COMPONENT_COLORS.length];
              const checked = selectedComponents[c.name] || false;
              const expanded = expandedComponents[c.name] || false;
              const compIssues = (c.issues || []).sort((a, b) => {
                const sa = a.start_date || a.due_date || '';
                const sb = b.start_date || b.due_date || '';
                return sa.localeCompare(sb);
              });
              return (
                <div key={c.name} className="comp-group">
                  <div className="comp-row">
                    <span
                      className={`comp-arrow ${expanded ? 'expanded' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleExpand(c.name); }}
                    >
                      {expanded ? '▼' : '▶'}
                    </span>
                    <label className="comp-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setSelectedComponents({ ...selectedComponents, [c.name]: e.target.checked })}
                      />
                      <span className="comp-color-dot" style={{ backgroundColor: baseColor }} />
                      <span className="comp-name">{c.name}</span>
                      <span className="component-count">{c.count}</span>
                    </label>
                  </div>
                  {expanded && (
                    <div className="comp-issues">
                      {compIssues.map((issue) => {
                        const issueColor = issueColors[issue.key] || baseColor;
                        return (
                          <div
                            key={issue.key}
                            className="comp-issue-item"
                            onClick={() => onSelectIssue(issue.key)}
                          >
                            <span className="comp-issue-color" style={{ backgroundColor: issueColor }} />
                            <span className="comp-issue-key">{issue.key}</span>
                            <span className="comp-issue-summary">{issue.summary}</span>
                            <span className="comp-issue-date">
                              {issue.start_date ? issue.start_date.split('T')[0] : (issue.due_date ? issue.due_date.split('T')[0] : '-')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {allComponents.length === 0 && <div style={{ padding: 8, fontSize: 11, color: '#6B778C' }}>No components found</div>}
          </div>
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
            <div ref={containerRef} className="timeline-gantt" />
          </>
        )}
      </div>
    </div>
  );
}
