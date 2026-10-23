# BM-12 镜像产物挂载修正

在BM-15接入检查中发现：旧Compose把backend整个目录覆盖/app，会遮住镜像里的dist和生产node_modules；从干净源码checkout启动新编译入口会失败。移除源码总目录及匿名node_modules挂载，保留原data/uploads相同路径并显式持久化backups；代码、文档和脚本使用已验收镜像内容。没有运行compose up/down，也没有修改现有服务或业务目录。

验证仅使用docker compose config --no-interpolate --no-env-resolution --quiet进行语法校验，不解析.env。实际生产挂载/非root/发布回退仍按BM-33～36门禁验证，不把语法检查当部署演练。
