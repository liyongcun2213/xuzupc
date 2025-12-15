const mysql = require('mysql');

console.log('正在检查MySQL连接...');

// 尝试连接MySQL服务器
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    charset: 'utf8mb4',
    insecureAuth: true
});

connection.connect(err => {
    if (err) {
        console.error('连接MySQL失败:', err.code);
        
        if (err.code === 'ECONNREFUSED') {
            console.log('\n解决方案:');
            console.log('1. 确保MySQL服务已启动');
            console.log('2. 检查MySQL服务是否在默认端口3306上运行');
            console.log('3. 检查用户名和密码是否正确');
        } else if (err.code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
            console.log('\n身份验证协议不兼容。请尝试以下解决方案:');
            console.log('1. 在MySQL命令行中执行:');
            console.log('   ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'xiaoli2213xX!\';');
            console.log('   FLUSH PRIVILEGES;');
            console.log('\n2. 或者使用XAMPP/WAMP等集成环境，它们通常使用兼容的身份验证方式');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n访问被拒绝。请检查:');
            console.log('1. MySQL用户名和密码是否正确');
            console.log('2. 用户是否有访问权限');
        }
        
        console.log('\n如果MySQL未安装，请考虑安装:');
        console.log('- XAMPP (推荐): https://www.apachefriends.org/');
        console.log('- MySQL Community Server: https://dev.mysql.com/downloads/mysql/');
        console.log('- MySQL Workbench: https://dev.mysql.com/downloads/workbench/');
        
        return;
    }
    
    console.log('✓ 成功连接到MySQL服务器');
    
    // 检查数据库是否存在
    connection.query('SHOW DATABASES LIKE "rental_system"', (err, result) => {
        if (err) {
            console.error('检查数据库失败:', err);
            connection.end();
            return;
        }
        
        if (result.length === 0) {
            console.log('× 数据库rental_system不存在');
            console.log('请运行 "npm run init-db" 来初始化数据库');
        } else {
            console.log('✓ 数据库rental_system已存在');
        }
        
        connection.end();
    });
});