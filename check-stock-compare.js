const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 查询PC0006和PC0007使用的配件对比
db.query(`
    SELECT 
        d.device_code,
        da.accessory_id,
        da.accessory_name,
        a.stock_quantity as current_stock
    FROM device_assemblies da
    JOIN devices d ON da.device_id = d.id
    JOIN accessories a ON da.accessory_id = a.id
    WHERE d.device_code IN ('PC0006', 'PC0007')
    ORDER BY d.device_code, da.accessory_id
`, (err, results) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('PC0006和PC0007使用的配件及当前库存:');
    console.table(results);
    
    db.end();
});
