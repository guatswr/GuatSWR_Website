module.exports = context => {
  const path = require('node:path');
  const { createGuestGateway } = require(path.join(context.BACKEND_ROOT, 'dist/src/security/guest-gateway'));
  return createGuestGateway(String(context.env.BFF_BRIDGE_SECRET || ''));
};
