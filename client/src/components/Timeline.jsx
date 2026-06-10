import { useState, useEffect, useMemo, useRef } from 'react';
import Gantt from 'frappe-gantt';
import { searchIssuesAll, getConfig } from '../jira-client';
import './Timeline.css';

const COMPONENT_COLORS = [
  '#6554C0', '#0052CC', '#00875A', '#E6A800',
  '#DE350B', '#403294', '#0747A6', '#00665A',
  '#7A5D00', '#BF2600', '#FF8B00', '#36B37E',
];

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
    components: (f.components || []).map(c => ({ id: c.id, name: c.name })),
  };
}

export default function Timeline({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedComponents, setSelectedComponents] = useState({});
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

  // Fetch all DEV1 project issues
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

  // Build component list
  const allComponents = useMemo(() => {
    const map = {};
    for (const issue of issues) {
      for (const c of (issue.components || [])) {
        if (!map[c.name]) map[c.name] = { name: c.name, count: 0 };
        map[c.name].count++;
      }
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [issues]);

  const activeNames = useMemo(
    () => Object.entries(selectedComponents).filter(([, v]) => v).map(([k]) => k),
    [selectedComponents]
  );

  const activeCount = activeNames.length;

  function toggleAll() {
    if (activeCount === allComponents.length && allComponents.length > 0) {
      setSelectedComponents({});
    } else {
      const all = {};
      allComponents.forEach(c => { all[c.name] = true; });
      setSelectedComponents(all);
    }
  }

  // Build Gantt tasks
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
      const compName = (issue.components || []).find(c => selectedComponents[c.name])?.name || '';
      const done = issue.status_category === 'Done';

      return {
        id: issue.key,
        name: `${issue.key}: ${issue.summary}`,
        start: start.split('T')[0],
        end: end.split('T')[0],
        progress: done ? 100 : 0,
        dependencies: '',
        custom_class: `gantt-comp-${compName.replace(/[^a-zA-Z0-9]/g, '_')}`,
      };
    }).filter(t => t.start && t.end);
  }, [issues, selectedComponents, activeNames]);

  // Inject dynamic CSS for component bar colors
  useEffect(() => {
    const styleId = 'gantt-comp-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const colorMap = {};
    activeNames.forEach((c, i) => {
      colorMap[c] = COMPONENT_COLORS[i % COMPONENT_COLORS.length];
    });
    styleEl.textContent = Object.entries(colorMap)
      .map(([name, color]) =>
        `.gantt-comp-${name.replace(/[^a-zA-Z0-9]/g, '_')} .bar { fill: ${color}; }`
      ).join('\n');

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.textContent = '';
    };
  }, [activeNames]);

  // Render Gantt
  useEffect(() => {
    if (!containerRef.current || tasks.length === 0) return;
    if (ganttRef.current) { containerRef.current.innerHTML = ''; }

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

    return () => {
      if (ganttRef.current) { containerRef.current.innerHTML = ''; ganttRef.current = null; }
    };
  }, [tasks]);

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
              const color = COMPONENT_COLORS[i % COMPONENT_COLORS.length];
              const checked = selectedComponents[c.name] || false;
              return (
                <label key={c.name}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setSelectedComponents({ ...selectedComponents, [c.name]: e.target.checked })}
                  />
                  <span className="comp-color-dot" style={{ backgroundColor: color }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span className="component-count">{c.count}</span>
                </label>
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
