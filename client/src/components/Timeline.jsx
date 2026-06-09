import { useState, useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import { searchIssuesAll } from '../jira-client';
import { getConfig } from '../jira-client';
import './Timeline.css';

export default function Timeline({ onSelectIssue }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const ganttRef = useRef(null);

  useEffect(() => {
    const cfg = getConfig();
    if (!cfg.url) return;

    const year = new Date().getFullYear();
    const jql = `(assignee = currentUser() OR reporter = currentUser()) AND created >= "${year}-01-01" ORDER BY created`;
    // Try tester field too if configured
    const jqlFull = cfg.testerField
      ? `(assignee = currentUser() OR reporter = currentUser() OR ${cfg.testerField} = currentUser()) AND created >= "${year}-01-01" ORDER BY created`
      : jql;

    searchIssuesAll(jqlFull).then(issues => {
      // Group by Epic
      const epicMap = {};
      const orphans = [];

      for (const issue of issues) {
        const f = issue.fields || {};
        const epicKey = f.epic ? f.epic.key : null;
        const parentKey = f.parent ? f.parent.key : null;

        if (epicKey) {
          if (!epicMap[epicKey]) epicMap[epicKey] = { children: [] };
          epicMap[epicKey].children.push(issue);
        } else if (f.issuetype && f.issuetype.name === 'Epic') {
          if (!epicMap[issue.key]) epicMap[issue.key] = { epic: issue, children: [] };
          epicMap[issue.key].epic = issue;
        } else if (parentKey) {
          // Might be a child of an Epic via parent
          if (!epicMap[parentKey]) epicMap[parentKey] = { children: [] };
          epicMap[parentKey].children.push(issue);
        } else {
          orphans.push(issue);
        }
      }

      // Build Gantt tasks: one per Epic
      const ganttTasks = [];

      for (const [key, group] of Object.entries(epicMap)) {
        const children = group.children || [];
        if (children.length === 0) continue;

        // Find date range
        let minStart = null, maxEnd = null;
        for (const c of children) {
          const f = c.fields || {};
          const start = f.duedate || null;
          const end = f.duedate || null;
          if (start && (!minStart || start < minStart)) minStart = start;
          if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
        }
        if (!minStart) minStart = new Date().toISOString().split('T')[0];
        if (!maxEnd || maxEnd < minStart) maxEnd = minStart;

        const epicName = group.epic ? group.epic.fields.summary : key;
        const doneCount = children.filter(c => (c.fields.status?.statusCategory?.name || '') === 'Done').length;
        const progress = children.length > 0 ? Math.round((doneCount / children.length) * 100) : 0;

        ganttTasks.push({
          id: key,
          name: `${key}: ${epicName} (${children.length})`,
          start: minStart.split('T')[0],
          end: maxEnd.split('T')[0],
          progress,
          dependencies: '',
          custom_class: 'gantt-epic-row'
        });
      }

      // Also add orphans as individual tasks
      for (const issue of orphans) {
        const f = issue.fields || {};
        const start = f.duedate || new Date().toISOString().split('T')[0];
        const end = f.duedate || start;
        ganttTasks.push({
          id: issue.key,
          name: `${issue.key}: ${f.summary || ''}`,
          start: start.split('T')[0],
          end: end.split('T')[0],
          progress: (f.status?.statusCategory?.name || '') === 'Done' ? 100 : 0,
          dependencies: '',
        });
      }

      setTasks(ganttTasks);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

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

  if (loading) return <div className="timeline-loading">Loading timeline...</div>;
  if (error) return <div className="timeline-error">Failed: {error}</div>;

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span>{tasks.length} epics this year</span>
      </div>
      <div ref={containerRef} className="timeline-gantt" />
    </div>
  );
}
