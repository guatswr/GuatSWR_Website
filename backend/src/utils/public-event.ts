const fields = ['id','type','title','content','status','created_by','created_at','updated_at','created_by_name','created_by_avatar'];
const privateKey = (key: string) => {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ['__proto__','constructor','prototype'].includes(key) || normalized === 'ip' || /visitorip|ipaddress|password|passwd|secret|token|authorization|credential|apikey|internal|private/.test(normalized);
};
// Preserve general/unknown historic fields; remove structured private metadata recursively.
const publicContent = (value: unknown, depth = 0): unknown => {
  if (depth > 32) return null;
  if (Array.isArray(value)) return (value as unknown[]).map(item => publicContent(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries((Object.entries(value) as [string, unknown][]).filter(([key]) => !privateKey(key)).map(([key,item]) => [key,publicContent(item,depth + 1)]));
  return value;
};
const publicEvent = (row: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(fields.filter(key => key in row).map(key => [key,key === 'content' ? publicContent(row[key]) : row[key]]));
export { publicEvent, publicContent }
