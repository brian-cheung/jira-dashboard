import { useMemo, useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import './Timeline.css';

const COMPONENT_COLORS = [
  '#6554C0', '#0052CC', '#00875A', '#E6A800',
  '#DE350B', '#403294', '#0747A6', '#00665A',
  '#7A5D00', '#BF2600', '#FF8B00', '#36B37E',
];

export default function Timeline({ issues, selectedComponents, onSelectIssue }) {
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

  const activeNames = useMemo(
    () => Object.entries(selectedComponents).filter(([, v]) => v).map(([k]) => k),
    [selectedComponents]
  );

  const tasks = useMemo(() => {
    if (activeNames.length === 0) return [];

    const filtered = issues.filter(i =>
      i.components && i.components.some(c => selectedComponents[c.name])
    );

    // Sort by start date
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

  if (activeNames.length === 0) {
    return <div className="timeline-empty">Select one or more components to view the timeline.</div>;
  }

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span>{tasks.length} item{tasks.length !== 1 ? 's' : ''} across {activeNames.length} component{activeNames.length !== 1 ? 's' : ''}</span>
      </div>
      <div ref={containerRef} className="timeline-gantt" />
    </div>
  );
}
