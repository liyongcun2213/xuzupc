const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

db.connect();

console.log('正在修改devices表的status字段...');

db.query(`
    ALTER TABLE devices 
    MODIFY COLUMN status ENUM('in_warehouse', 'available', 'rented', 'maintenance', 'retired') 
    DEFAULT 'in_warehouse'
`, (err) => {
    if (err) {
        console.error('修改失败:', err);
    } else {
        console.log('✓ 成功修改status字段类型，已添加 in_warehouse 选项');
    }
    db.end();
});
