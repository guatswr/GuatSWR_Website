const path = require('node:path');
const root = require('../models/db').resolvePaths({}).BACKEND_ROOT;
module.exports = require(path.join(root, 'dist/src/utils/public-log'));
