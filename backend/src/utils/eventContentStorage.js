const path = require('path');

const createEventContentPersister = ({ imageRoot, moveStagedFile }) => async (content, eventId) => {
  const id = Number(eventId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid event id');
  const targetDir = path.join(imageRoot, 'events', String(id));
  const movedUrls = new Map();

  const visit = async (value) => {
    if (typeof value === 'string') {
      // Only local temporary uploads move; visitor uploads already live under their EID.
      if (!value.startsWith('/uploads/upload/')) return value;
      const filename = value.slice('/uploads/upload/'.length);
      if (!filename || filename === '.' || filename === '..' || /[\\/?#]/.test(filename)) return value;
      if (!movedUrls.has(value)) movedUrls.set(value, await moveStagedFile(value, targetDir));
      return movedUrls.get(value);
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await visit(item));
      return result;
    }
    if (value && typeof value === 'object') {
      const entries = [];
      for (const [key, item] of Object.entries(value)) entries.push([key, await visit(item)]);
      return Object.fromEntries(entries);
    }
    return value;
  };

  return visit(content);
};

module.exports = { createEventContentPersister };
