const { app, PORT } = require('./src/app');

const server = app.listen(PORT, () => {
  console.log(`***后端服务v4.0已启动 (Port ${PORT})***`);
});
server.on('clientError', (err, socket) => { socket.destroy(err); });
