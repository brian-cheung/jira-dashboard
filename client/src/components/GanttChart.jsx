import { useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import './GanttChart.css';

function mapIssuesToGanttTasks(issues) {
  return issues.map(issue => {
    const start = issue.start_date || issue.due_date || new Date().toISOString().split('T')[0];
    const end = issue.due_date || start;
    const progress = issue.status_category === 'Done' ? 100
      : issue.status_category === 'In Progress' ? 50
      : 0;

    return {
      id: issue.key,
      name: `${issue.key}: ${issue.summary}`,
      start: start.split('T')[0],
      end: end.split('T')[0],
      progress,
      dependencies: '',
      custom_class: `gantt-status-${(issue.status || '').replace(/\s+/g, '-').toLowerCase()}`
    };
  });
}

export default function GanttChart({ issues, onSelectIssue, selectedKey }) {
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || issues.length === 0) return;

    if (ganttRef.current) {
      containerRef.current.innerHTML = '';
    }

    const tasks = mapIssuesToGanttTasks(issues);

    ganttRef.current = new Gantt(containerRef.current, tasks, {
      view_mode: 'Week',
      date_format: 'YYYY-MM-DD',
      on_click: (task) => {
        onSelectIssue(task.id);
      },
      on_date_change: (task, start, end) => {
        // Date change will be handled by the parent
      },
      custom_popup_html: (task) => {
        const issue = issues.find(i => i.key === task.id);
        if (!issue) return '';
        return `
          <div class="gantt-popup">
            <strong>${task.id}</strong>
            <p>${issue.summary || ''}</p>
            <p>Status: ${issue.status} | Assignee: ${issue.assignee_name}</p>
          </div>
        `;
      }
    });

    return () => {
      if (ganttRef.current) {
        containerRef.current.innerHTML = '';
        ganttRef.current = null;
      }
    };
  }, [issues]);

  // Highlight selected bar
  useEffect(() => {
    if (!ganttRef.current || !selectedKey) return;

    const bars = containerRef.current.querySelectorAll('.bar');
    bars.forEach(b => {
      b.style.outline = b.getAttribute('data-id') === selectedKey ? '2px solid #0052CC' : '';
    });
  }, [selectedKey]);

  if (issues.length === 0) {
    return <div className="gantt-empty">Loading tasks... Sync in progress.</div>;
  }

  return <div ref={containerRef} className="gantt-container" />;
}
