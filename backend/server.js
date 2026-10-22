require('dotenv').config();
const { createApplication } = require('./src/app');

const start = async () => {
  const instance = await createApplication();
  try {
    const server = await instance.listen();
    console.log(`***后端服务v4.0已启动 (Port ${server.address().port})***`);
    const shutdown = () => instance.close().catch((error) => {
      console.error('[Shutdown]', error.code || error.message);
      process.exitCode = 1;
    });
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    return instance;
  } catch (error) {
    await instance.close();
    throw error;
  }
};
if (require.main === module) start().catch((error) => {
  console.error('[Startup]', error.code || error.message);
  process.exitCode = 1;
});
module.exports = { start };
