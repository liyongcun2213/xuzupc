const mysql = require('mysql');
const fs = require('fs');

// 创建连接，先不指定数据库
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    charset: 'utf8mb4',
    insecureAuth: true
});

// 连接到MySQL服务器
connection.connect(err => {
    if (err) {
        console.error('连接MySQL服务器失败:', err);
        if (err.code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
            console.log('\n身份验证协议不兼容。请尝试以下解决方案之一：');
            console.log('1. 在MySQL命令行中执行:');
            console.log('   ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'xiaoli2213xX!\';');
            console.log('   FLUSH PRIVILEGES;');
            console.log('\n2. 或者在MySQL配置文件中添加:');
            console.log('   [mysqld]');
            console.log('   default_authentication_plugin=mysql_native_password');
        }
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 创建数据库
    connection.query('CREATE DATABASE IF NOT EXISTS rental_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', (err, result) => {
        if (err) {
            console.error('创建数据库失败:', err);
            return;
        }
        console.log('数据库已创建或已存在');
        
        // 使用数据库
        connection.query('USE rental_system', (err) => {
            if (err) {
                console.error('选择数据库失败:', err);
                return;
            }
            console.log('已选择rental_system数据库');
            
            // 读取SQL文件并执行
            fs.readFile('database.sql', 'utf8', (err, data) => {
                if (err) {
                    console.error('读取SQL文件失败:', err);
                    return;
                }
                
                // 分割SQL语句
                const statements = data.split(';').filter(statement => statement.trim());
                
                // 执行每个SQL语句
                let completed = 0;
                statements.forEach(statement => {
                    if (statement.trim()) {
                        connection.query(statement, (err, result) => {
                            if (err && !err.message.includes('already exists')) {
                                console.error('执行SQL语句失败:', err.message);
                                console.error('语句:', statement.substring(0, 100));
                            } else {
                                completed++;
                            }
                            
                            // 检查是否所有语句都执行完成
                            if (completed === statements.length) {
                                console.log('数据库初始化完成');
                                connection.end();
                            }
                        });
                    }
                });
            });
        });
    });
});