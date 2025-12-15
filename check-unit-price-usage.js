const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

console.log('查看 accessories 表的 unit_price 和 purchase_price 字段信息：\n');

db.query('SHOW FULL COLUMNS FROM accessories', (err, columns) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    const priceFields = columns.filter(col => 
        col.Field === 'unit_price' || col.Field === 'purchase_price'
    );
    
    console.table(priceFields);
    
    console.log('\n查看这两个字段的实际数据情况：\n');
    
    db.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(unit_price) as has_unit_price,
            COUNT(purchase_price) as has_purchase_price,
            AVG(unit_price) as avg_unit_price,
            AVG(purchase_price) as avg_purchase_price
        FROM accessories
    `, (err, stats) => {
        if (err) {
            console.error(err);
            db.end();
            return;
        }
        
        console.log('统计信息：');
        console.table(stats);
        
        console.log('\n样本数据（前10条）：\n');
        db.query(`
            SELECT id, name, unit_price, purchase_price 
            FROM accessories 
            LIMIT 10
        `, (err, samples) => {
            if (err) {
                console.error(err);
                db.end();
                return;
            }
            
            console.table(samples);
            db.end();
        });
    });
});
