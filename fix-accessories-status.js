const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

db.connect();

console.log('正在修改accessories表的status字段...');

db.query(`
    ALTER TABLE accessories 
    MODIFY COLUMN status ENUM('active', 'inactive', 'in_warehouse', 'assembled', 'scrapped') 
    DEFAULT 'in_warehouse'
`, (err) => {
    if (err) {
        console.error('修改失败:', err);
    } else {
        console.log('✓ 成功修改accessories.status字段类型');
        console.log('  可用值: active, inactive, in_warehouse, assembled, scrapped');
    }
    db.end();
});
