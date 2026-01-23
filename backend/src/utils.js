const safeJsonParse = (str) => {
  if (!str) return [];
  try { return JSON.parse(str); } catch (e) { return []; }
};

const normalizeImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') return safeJsonParse(images);
  return [];
};

const validate = (schema, data) => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues?.[0]?.message || '参数错误';
    return { ok: false, error: msg };
  }
  return { ok: true, data: parsed.data };
};

module.exports = { safeJsonParse, normalizeImages, validate };
