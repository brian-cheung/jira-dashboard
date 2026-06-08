import { useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import './GanttChart.css';

function isValidDate(str) {
  if (!str) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(str);
}

function mapIssuesToGanttTasks(issues) {
  return issues
    .filter(i => isValidDate(i.start_date) || isValidDate(i.due_date))
    .map(issue => {
      let start = isValidDate(issue.start_date) ? issue.start_date.split('T')[0]
        : isValidDate(issue.due_date) ? issue.due_date.split('T')[0]
        : new Date().toISOString().split('T')[0];
      let end = isValidDate(issue.due_date) ? issue.due_date.split('T')[0] : start;
      // Swap if end is before start (data entry errors in JIRA)
      if (end < start) [start, end] = [end, start];
      const progress = issue.status_category === 'Done' ? 100
        : issue.status_category === 'In Progress' ? 50
        : 0;

      return {
        id: issue.key,
        name: `${issue.key}: ${issue.summary}`,
        start,
        end,
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

  const dated = issues.filter(i => isValidDate(i.start_date) || isValidDate(i.due_date));
  if (dated.length === 0) {
    return <div className="gantt-empty">No tasks with start/due dates. {issues.length} tasks in the tree.</div>;
  }

  return (
    <div className="gantt-wrapper">
      <div className="gantt-info">{dated.length} tasks with dates shown ({(issues.length - dated.length)} unscheduled)</div>
      <div ref={containerRef} className="gantt-container" />
    </div>
  );
}
