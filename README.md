# 电脑租赁管理系统

一个基于Node.js、Express和MySQL的电脑租赁管理系统，采用EJS模板引擎和Bootstrap框架。

## 功能模块

系统包含以下7大模块：

### 1. 基础信息管理
- **客户管理**：管理租用电脑设备的客户信息，包括信用等级
- **用户管理**：管理系统用户，包括管理员、财务和业务员
- **供应商管理**：管理提供电脑配件的供应商
- **合作伙伴管理**：管理提供业务的合作伙伴，包括佣金结算

### 2. 产品管理
- 管理电脑产品信息、品牌、型号和租赁价格

### 3. 设备管理
- 管理具体的电脑设备，包括序列号、状态和位置

### 4. 采购管理
- 管理从供应商采购设备的订单

### 5. 租赁管理
- 管理客户租赁设备的订单，包括日租和月租

### 6. 退租管理
- 处理设备归还、设备状况评估和退款

### 7. 财务管理
- 记录和管理所有财务收支

## 技术栈

- **后端**：Node.js, Express.js
- **前端**：EJS模板, Bootstrap 5, Bootstrap Icons
- **数据库**：MySQL
- **其他依赖**：body-parser, express-session, bcrypt, moment

## 安装与运行

### 1. 环境要求
- Node.js 14.x 或更高版本
- MySQL 5.7 或更高版本

### 2. 安装MySQL（如果尚未安装）
推荐使用以下安装方式之一：

#### 选项1：XAMPP（推荐）
- 下载并安装XAMPP：https://www.apachefriends.org/
- 启动MySQL服务
- 默认用户名：root，密码留空或设置为xiaoli2213xX!

#### 选项2：MySQL Community Server
- 下载并安装MySQL：https://dev.mysql.com/downloads/mysql/
- 记住设置的root密码

### 3. 检查MySQL连接
```bash
npm run check-mysql
```

### 4. 解决MySQL身份验证问题（如果遇到）
如果出现身份验证协议不兼容错误，请在MySQL命令行中执行：
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'xiaoli2213xX!';
FLUSH PRIVILEGES;
```

### 5. 安装项目依赖
```bash
npm install
```

### 6. 初始化数据库
```bash
npm run init-db
```

### 7. 启动应用
```bash
npm start
```

或者使用开发模式（需要安装nodemon）：
```bash
npm run dev
```

### 8. 访问系统
打开浏览器访问：http://localhost:3000

### 9. 默认登录信息
- 用户名：admin
- 密码：admin123

## 常见问题

### 问题1：无法连接到MySQL
**错误信息**：`ECONNREFUSED`
**解决方案**：
1. 确保MySQL服务已启动
2. 检查MySQL是否在端口3306上运行
3. 检查用户名和密码是否正确

### 问题2：身份验证协议不兼容
**错误信息**：`ER_NOT_SUPPORTED_AUTH_MODE`
**解决方案**：
1. 在MySQL命令行中执行：
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'xiaoli2213xX!';
   FLUSH PRIVILEGES;
   ```
2. 或者使用XAMPP，它通常使用兼容的身份验证方式

### 问题3：无法访问页面
**解决方案**：
1. 确保服务器已成功启动（没有错误信息）
2. 检查端口3000是否被其他程序占用
3. 尝试访问 http://localhost:3000 而不是 https://localhost:3000

## 用户角色权限

- **管理员**：拥有系统所有权限
- **财务**：负责财务管理和佣金结算
- **业务员**：负责销售和租赁业务

## 项目结构

```
rental-system-v3/
├── database.sql          # 数据库初始化脚本
├── package.json          # 项目依赖配置
├── server.js             # 服务器入口文件
├── public/               # 静态资源
│   └── css/
│       └── custom.css    # 自定义样式
└── views/                # EJS模板文件
    ├── layout.ejs        # 布局模板
    ├── login.ejs         # 登录页面
    ├── dashboard.ejs      # 仪表板
    ├── customers/        # 客户管理
    ├── users/            # 用户管理
    ├── suppliers/        # 供应商管理
    ├── partners/         # 合作伙伴管理
    ├── products/         # 产品管理
    ├── devices/          # 设备管理
    ├── purchase-orders/  # 采购管理
    ├── rental-orders/    # 租赁管理
    ├── returns/          # 退租管理
    └── finance/          # 财务管理
```

## 注意事项

1. 系统使用简体中文界面
2. 左侧边栏导航设计，适应不同屏幕尺寸
3. 响应式布局，支持移动设备访问
4. 使用Bootstrap 5框架，界面美观现代
5. 数据库密码在配置中已设置为xiaoli2213xX!，请根据实际情况修改

## 许可证

MIT License