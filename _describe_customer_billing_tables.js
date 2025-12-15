const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect((err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        return;
    }
    
    console.log('数据库连接成功\n');
    console.log('检查客户消费相关表结构...\n');
    
    const tables = ['payment_records', 'customer_transaction_details', 'rental_orders'];
    let checked = 0;
    
    tables.forEach((tableName) => {
        console.log('\n表: ' + tableName);
        console.log('='.repeat(60));
        db.query('DESCRIBE ' + tableName, (err, rows) => {
            if (err) {
                console.error('DESCRIBE 失败:', err);
            } else {
                rows.forEach((field) => {
                    console.log(`${field.Field}\t${field.Type}\tNULL=${field.Null}\tKEY=${field.Key}\tDEFAULT=${field.Default}`);
                });
            }
            checked++;
            if (checked === tables.length) {
                db.end();
            }
        });
    });
});
