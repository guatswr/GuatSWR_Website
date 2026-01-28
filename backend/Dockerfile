# 使用 Node.js 18 作为基础镜像（可通过构建参数指定镜像源前缀）
ARG IMAGE_REGISTRY=
FROM ${IMAGE_REGISTRY}node:18-bullseye-slim

# 设置工作目录
WORKDIR /app

# APT 国内镜像（可在构建时覆盖）
ARG APT_MIRROR=http://mirrors.aliyun.com/debian
ARG APT_SECURITY_MIRROR=http://mirrors.aliyun.com/debian-security

# 复制 package.json 并安装依赖
COPY package*.json ./
RUN sed -i "s|http://deb.debian.org/debian|${APT_MIRROR}|g" /etc/apt/sources.list \
	&& sed -i "s|http://security.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" /etc/apt/sources.list \
	&& apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
	&& apt-get install -y --no-install-recommends python3 make g++ ca-certificates sqlite3 \
	&& rm -rf /var/lib/apt/lists/*
RUN npm config set registry https://registry.npmmirror.com \
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