const mysql = require('mysql');
const fs = require('fs');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
});

connection.connect((err) => {
    if (err) {
        console.error('连接失败:', err);
        process.exit(1);
    }

    console.log('读取SQL文件...');
    let sql = fs.readFileSync('fix-allocate-procedure.sql', 'utf8');
    
    // 移除 DELIMITER 命令（Node.js客户端不需要）
    sql = sql.replace(/DELIMITER\s+\$\$/gi, '');
    sql = sql.replace(/DELIMITER\s+;/gi, '');
    sql = sql.replace(/\$\$/g, ';');
    
    console.log('执行SQL更新存储过程...');
    connection.query(sql, (err, result) => {
        if (err) {
            console.error('更新失败:', err);
            connection.end();
            process.exit(1);
        }
        
        console.log('✓ 存储过程更新成功！');
        console.log('现在可以组装设备了');
        connection.end();
    });
});
