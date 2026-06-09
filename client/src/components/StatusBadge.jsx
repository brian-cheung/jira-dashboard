// Semantic status colors: lighter bg + darker text/border from same palette
const STATUS_COLORS = {
  'Backlog':       { bg: '#DFD8FD', text: '#403294', border: '#6554C0' },
  'To Do':         { bg: '#DFE1E6', text: '#42526E', border: '#97A0AF' },
  'In Progress':   { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' },
  'In progress':   { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' },
  'Ready for UAT': { bg: '#DDF4F2', text: '#00665A', border: '#00897B' },
  'UAT':           { bg: '#FFF0B3', text: '#7A5D00', border: '#E6A800' },
  'Ready for deployment': { bg: '#D7F0E2', text: '#135C32', border: '#1F845A' },
  'Done':          { bg: '#E3FCEF', text: '#006644', border: '#00875A' },
  'On Hold':       { bg: '#FFEBE6', text: '#BF2600', border: '#DE350B' },
  'Blocked':       { bg: '#FFEBE6', text: '#BF2600', border: '#DE350B' },
  'In Review':     { bg: '#FFF0B3', text: '#7A5D00', border: '#E6A800' },
};

// Fixed display order for status filters
export const STATUS_ORDER = [
  'Backlog', 'To Do', 'In Progress', 'Ready for UAT', 'UAT',
  'Ready for deployment', 'Done', 'On Hold', 'Blocked', 'In Review'
];

export default function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E', border: '#97A0AF' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      whiteSpace: 'nowrap'
    }}>
      {status}
    </span>
  );
}

export function getStatusColor(status) {
  return STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E', border: '#97A0AF' };
}
