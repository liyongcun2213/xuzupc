const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 检查specifications字段是否存在
db.query('SHOW COLUMNS FROM products LIKE "specifications"', (err, columns) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    if (columns.length === 0) {
        console.log('⚠️  specifications字段不存在，需要添加');
    } else {
        console.log('✓ specifications字段存在');
        console.table(columns);
    }
    
    // 查看产品数据
    db.query('SELECT id, code, name, specifications FROM products', (err2, products) => {
        if (err2) {
            console.error(err2);
        } else {
            console.log('\n产品列表:');
            console.table(products);
        }
        db.end();
    });
});
