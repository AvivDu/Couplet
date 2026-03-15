export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F4856A',
  Fashion: '#9B7EC8',
  Groceries: '#7DC99E',
  Electronics: '#6BBDE8',
  Beauty: '#EC9BC0',
  Travel: '#5BC8A8',
  Sport: '#F4856A',
  Other: '#B8C4CC',
};

export const YEARS = Array.from({ length: 12 }, (_, i) => String(2025 + i));

export const MONTHS = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

export const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
