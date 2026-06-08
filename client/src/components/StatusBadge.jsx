const STATUS_COLORS = {
  'To Do': { bg: '#DFE1E6', text: '#42526E' },
  'In Progress': { bg: '#DEEBFF', text: '#0747A6' },
  'Done': { bg: '#E3FCEF', text: '#006644' },
  'In Review': { bg: '#FFF0B3', text: '#7A5D00' },
  'Blocked': { bg: '#FFEBE6', text: '#BF2600' },
};

export default function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#DFE1E6', text: '#42526E' };
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
