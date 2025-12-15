const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect();

// 查询PC0007使用的配件
db.query('SELECT accessory_id, accessory_name FROM device_assemblies WHERE device_id = 9', (err, results) => {
    if (err) {
        console.error(err);
        db.end();
        return;
    }
    
    console.log('PC0007使用的配件:');
    console.table(results);
    
    const ids = results.map(r => r.accessory_id).join(',');
    
    // 查询这些配件的当前库存
    db.query(`SELECT id, name, stock_quantity FROM accessories WHERE id IN (${ids})`, (err2, results2) => {
        if (err2) {
            console.error(err2);
        } else {
            console.log('\n这些配件的当前库存:');
            console.table(results2);
        }
        db.end();
    });
});
