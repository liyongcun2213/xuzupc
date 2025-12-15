const mysql = require('mysql');
const fs = require('fs');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
});

db.connect(err => {
    if (err) {
        console.error('数据库连接失败:', err);
        process.exit(1);
    }
    console.log('已连接到数据库');
    
    const sql = fs.readFileSync('./add-scrapped-quantity-to-batch.sql', 'utf8');
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('执行失败:', err);
            db.end();
            process.exit(1);
        }
        
        console.log('✓ 成功添加 scrapped_quantity 字段并更新 available_quantity 计算逻辑');
        
        db.end();
    });
});
