const mysql = require('mysql');

console.log('正在尝试修复MySQL身份验证问题...');

// 先尝试连接root账户并修改密码
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // 尝试空密码
    charset: 'utf8mb4',
    insecureAuth: true
});

connection.connect(err => {
    if (err) {
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('使用空密码连接失败，请手动执行以下命令修复MySQL身份验证问题：');
            console.log('\n1. 打开MySQL命令行客户端:');
            console.log('   "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe" -u root -p');
            console.log('\n2. 输入您的MySQL root密码');
            console.log('\n3. 执行以下SQL命令:');
            console.log('   ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'xiaoli2213xX!\';');
            console.log('   FLUSH PRIVILEGES;');
            console.log('\n4. 然后运行 npm run check-mysql 检查连接');
        } else {
            console.error('连接MySQL失败:', err.code, err.message);
        }
        return;
    }
    
    console.log('成功连接到MySQL，现在尝试修改密码...');
    
    // 修改密码和认证方式
    connection.query('ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'xiaoli2213xX!\';', (err, result) => {
        if (err) {
            console.error('修改认证方式失败:', err.message);
            connection.end();
            return;
        }
        
        console.log('✓ 成功修改认证方式和密码');
        
        // 刷新权限
        connection.query('FLUSH PRIVILEGES;', (err, result) => {
            if (err) {
                console.error('刷新权限失败:', err.message);
            } else {
                console.log('✓ 已刷新权限');
                console.log('现在可以运行 npm run check-mysql 检查连接');
            }
            
            connection.end();
        });
    });
});