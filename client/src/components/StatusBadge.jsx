const STATUS_COLORS = {
  'To Do': { bg: '#DFE1E6', text: '#42526E', border: '#DFE1E6' },
  'In Progress': { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' },
  'In progress': { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' },
  'Done': { bg: '#E3FCEF', text: '#006644', border: '#00875A' },
  'In Review': { bg: '#FFF0B3', text: '#7A5D00', border: '#FFAB00' },
  'Blocked': { bg: '#FFEBE6', text: '#BF2600', border: '#DE350B' },
  'Backlog': { bg: '#EAE6FF', text: '#403294', border: '#5243AA' },
  'On Hold': { bg: '#FFF7E6', text: '#7A5D00', border: '#FF8B00' },
  'Ready for UAT': { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' },
  'UAT': { bg: '#E3FCEF', text: '#006644', border: '#00875A' },
  'Ready for deployment': { bg: '#EAE6FF', text: '#403294', border: '#5243AA' },
};

export default function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E', border: '#DFE1E6' };
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
  return STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E', border: '#DFE1E6' };
}
