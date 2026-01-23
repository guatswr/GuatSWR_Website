# 使用 Node.js 18 作为基础镜像
FROM node:18-bullseye-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 并安装依赖
COPY package*.json ./
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm config set registry https://registry.npmmirror.com \
	&& npm config set fetch-retries 5 \
	&& npm config set fetch-retry-mintimeout 20000 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm config set fund false \
	&& npm config set audit false \
	&& npm install --omit=dev --prefer-offline

# 复制源代码
COPY . .

# 暴露容器端口
EXPOSE 3000

# 创建数据卷挂载点 (确保目录存在)
RUN mkdir -p /app/data /app/uploads

# 启动命令
CMD ["node", "server.js"]