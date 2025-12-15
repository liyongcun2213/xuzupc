const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

db.connect();

console.log('正在修改devices表的字段...');

const queries = [
    "ALTER TABLE devices MODIFY COLUMN purchase_date DATE NULL",
    "ALTER TABLE devices MODIFY COLUMN purchase_price DECIMAL(10,2) NULL",
    "ALTER TABLE devices MODIFY COLUMN supplier_id INT NULL",
    "ALTER TABLE devices MODIFY COLUMN warranty_expiry DATE NULL",
    "ALTER TABLE devices MODIFY COLUMN location VARCHAR(100) NULL",
    "ALTER TABLE devices MODIFY COLUMN notes TEXT NULL"
];

let completed = 0;

queries.forEach((query, index) => {
    db.query(query, (err) => {
        if (err) {
            console.error(`修改失败 (${index + 1}):`, err.message);
        } else {
            console.log(`✓ 成功修改字段 (${index + 1}/${queries.length})`);
        }
        
        completed++;
        if (completed === queries.length) {
            console.log('\n所有字段修改完成！');
            db.end();
        }
    });
});
