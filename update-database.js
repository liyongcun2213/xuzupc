const mysql = require('mysql');
const fs = require('fs');
const path = require('path');

// 数据库配置
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4',
    insecureAuth: true
};

// 读取SQL文件
const sqlFilePath = path.join(__dirname, 'update-product-db.sql');
const sql = fs.readFileSync(sqlFilePath, 'utf8');

// 创建连接
const connection = mysql.createConnection(dbConfig);

connection.connect(err => {
    if (err) {
        console.error('数据库连接失败:', err);
        return;
    }
    console.log('已连接到数据库，开始执行更新...');

    // 分割SQL语句并执行
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0 && !stmt.trim().startsWith('--'));
    
    let completed = 0;
    
    statements.forEach((statement, index) => {
        connection.query(statement, (err, results) => {
            if (err) {
                // 忽略"表已存在"等错误
                if (!err.message.includes('already exists') && 
                    !err.message.includes('Duplicate entry') && 
                    !err.message.includes('CHECK') &&
                    !err.message.includes('Key')) {
                    console.error(`执行语句失败: ${err.message}`);
                    console.error(`语句内容: ${statement.substring(0, 100)}...`);
                }
            }
            
            completed++;
            if (completed === statements.length) {
                console.log('数据库更新完成！');
                connection.end();
            }
        });
    });
});