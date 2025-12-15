const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

db.connect();

console.log('正在修改devices表的serial_number字段...');

db.query(`
    ALTER TABLE devices 
    MODIFY COLUMN serial_number VARCHAR(100) NULL
`, (err) => {
    if (err) {
        console.error('修改失败:', err);
    } else {
        console.log('✓ 成功修改serial_number字段为可NULL');
    }
    db.end();
});
