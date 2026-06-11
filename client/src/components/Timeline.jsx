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

export default function Timeline({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedComponents, setSelectedComponents] = useState({});
  const [expandedComponents, setExpandedComponents] = useState({});
  const [hideDone, setHideDone] = useState(false);
  const ganttContainerRef = useRef(null);
  const ganttRef = useRef(null);
  const headerRef = useRef(null);
  const scrollSyncRef = useRef(null);

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
      const start = issue.start_date || issue.due_date || '';
      const end = issue.due_date || issue.start_date || '';
      return {
        id: issue.key,
        name: `${issue.key}: ${issue.summary}`,
        start: start.split('T')[0],
        end: end.split('T')[0],
        progress: issue.status_category === 'Done' ? 100 : 0,
        dependencies: '',
      };
    }).filter(t => t.start && t.end);
  }, [issues, selectedComponents, hideDone]);

  // Inject CSS for bar colors
  useEffect(() => {
    const styleId = 'gantt-comp-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = Object.entries(issueColors)
      .map(([key, color]) => `.bar-wrapper[data-id="${key}"] .bar { fill: ${color} !important; }`)
      .join('\n');
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.textContent = '';
    };
  }, [issueColors]);

  // Render Gantt
  useEffect(() => {
    const container = ganttContainerRef.current;
    if (!container || tasks.length === 0) return;

    // Clean up previous
    if (ganttRef.current) {
      container.innerHTML = '';
      ganttRef.current = null;
    }

    try {
      ganttRef.current = new Gantt(container, tasks, {
        view_mode: 'Month',
        date_format: 'YYYY-MM-DD',
        bar_height: 24,
        padding: 18,
        on_click: (task) => onSelectIssue(task.id),
        custom_popup_html: (task) =>
          `<div class="gantt-popup"><strong>${task.id}</strong><br/>${task.name}<br/>Progress: ${task.progress}%</div>`,
      });

      requestAnimationFrame(() => {
        if (!container || !ganttRef.current) return;
        const svg = container.querySelector('svg');
        if (!svg) return;

        // Apply colors, position labels
        const wrappers = container.querySelectorAll('.bar-wrapper');
        for (const w of wrappers) {
          const taskId = w.getAttribute('data-id');
          if (taskId && issueColors[taskId]) {
            const bar = w.querySelector('.bar');
            if (bar) bar.style.fill = issueColors[taskId];
          }
          const label = w.querySelector('.bar-label');
          const bar = w.querySelector('.bar');
          if (label && bar) {
            const bx = parseFloat(bar.getAttribute('x') || 0);
            const bw = parseFloat(bar.getAttribute('width') || 0);
            label.setAttribute('x', bx + bw + 5);
            label.classList.add('big');
          }
        }

        // Today line with label
        const gantt = ganttRef.current;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const start = new Date(gantt.gantt_start); start.setHours(0, 0, 0, 0);
        const todayX = (((today - start) / (1000 * 60 * 60)) / gantt.options.step) * gantt.options.column_width;
        // Get full SVG height from viewBox
        const vb = svg.getAttribute('viewBox')?.split(' ').map(Number) || [];
        const svgH = vb[3] || parseFloat(svg.getAttribute('height') || '800');

        // Remove old today group if exists, then create fresh
        let todayGroup = document.getElementById('today-indicator');
        if (todayGroup) todayGroup.remove();
        todayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        todayGroup.id = 'today-indicator';

        // Vertical dashed line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', todayX); line.setAttribute('y1', 65);
        line.setAttribute('x2', todayX); line.setAttribute('y2', svgH);
        line.setAttribute('stroke', '#DE350B');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '6,4');
        line.setAttribute('opacity', '0.7');
        todayGroup.appendChild(line);

        // Small circle at top of line
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', todayX); circle.setAttribute('cy', 65);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#DE350B');
        todayGroup.appendChild(circle);

        // "Today" label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', todayX); text.setAttribute('y', 58);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#DE350B');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '600');
        text.textContent = 'Today';
        todayGroup.appendChild(text);

        svg.appendChild(todayGroup);

        // Pin month header and hide original date group
        const dateGroup = svg.querySelector('g.date');
        const pinned = headerRef.current;
        if (dateGroup && pinned) {
          const pinnedSvg = pinned.querySelector('svg');
          if (pinnedSvg) {
            const svgW = svg.getAttribute('width') || svg.getAttribute('viewBox')?.split(' ')[2] || '100%';
            pinnedSvg.setAttribute('width', svgW);
            pinnedSvg.setAttribute('height', '60');
            pinnedSvg.innerHTML = dateGroup.outerHTML;
          }
          // Hide the original date group in the scrollable SVG
          dateGroup.setAttribute('visibility', 'hidden');
          // Sync scroll initially
          pinned.scrollLeft = ganttContainerRef.current?.scrollLeft || 0;
        }
      });
    } catch (e) {
      console.error('Gantt render error:', e);
    }

    return () => {
      if (container) container.innerHTML = '';
      ganttRef.current = null;
    };
  }, [tasks, issueColors]);

  // Sync Gantt horizontal scroll with pinned header
  useEffect(() => {
    const container = ganttContainerRef.current;
    if (!container || tasks.length === 0) return;
    const pinned = headerRef.current;
    if (!pinned) return;
    const onScroll = () => { pinned.scrollLeft = container.scrollLeft; };
    container.addEventListener('scroll', onScroll, { passive: true });
    // Initial sync
    pinned.scrollLeft = container.scrollLeft;
    return () => container.removeEventListener('scroll', onScroll);
  }, [tasks]);

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
              <div className="gantt-header-pinned" ref={headerRef}>
                <svg xmlns="http://www.w3.org/2000/svg"></svg>
              </div>
              <div ref={ganttContainerRef} className="timeline-gantt" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
