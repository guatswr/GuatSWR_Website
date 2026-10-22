const fields = ['id','type','title','content','status','created_by','created_at','updated_at','created_by_name','created_by_avatar'];
const privateKey = (key) => {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ['__proto__','constructor','prototype'].includes(key) || normalized === 'ip' || /visitorip|ipaddress|password|passwd|secret|token|authorization|credential|apikey|internal|private/.test(normalized);
};
// Preserve general/unknown historic fields; remove structured private metadata recursively.
const publicContent = (value, depth = 0) => {
  if (depth > 32) return null;
  if (Array.isArray(value)) return value.map(item => publicContent(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKey(key)).map(([key,item]) => [key,publicContent(item,depth + 1)]));
  return value;
};
const publicEvent = (row) => Object.fromEntries(fields.filter(key => key in row).map(key => [key,key === 'content' ? publicContent(row[key]) : row[key]]));
module.exports = { publicEvent, publicContent };
