// 初始化租金管理表
const mysql = require('mysql');
const fs = require('fs');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
});

db.connect((err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        process.exit(1);
    }
    console.log('已连接到数据库');
    
    const sql = fs.readFileSync('./create-rent-management-tables.sql', 'utf8');
    
    db.query(sql, (error, results) => {
        if (error) {
            console.error('执行SQL失败:', error);
            db.end();
            process.exit(1);
        }
        console.log('租金管理表创建成功！');
        db.end();
    });
});
