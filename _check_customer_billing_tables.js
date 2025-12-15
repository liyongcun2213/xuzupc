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
    console.log('检查客户消费管理相关表...\n');
    console.log('='.repeat(80));
    
    const tables = [
        'customer_accounts',
        'payment_records',
        'daily_rental_charges',
        'customer_transaction_details'
    ];
    
    let checkedCount = 0;
    
    tables.forEach(tableName => {
        db.query(`SHOW TABLES LIKE '${tableName}'`, (err, results) => {
            checkedCount++;
            
            if (err) {
                console.error(`检查表 ${tableName} 失败:`, err);
            } else if (results.length === 0) {
                console.log(`❌ 表 ${tableName} 不存在`);
            } else {
                console.log(`✅ 表 ${tableName} 存在`);
                
                // 查询表结构和数据量
                db.query(`SELECT COUNT(*) as count FROM ${tableName}`, (err, countResult) => {
                    if (!err && countResult.length > 0) {
                        console.log(`   数据量: ${countResult[0].count} 条`);
                    }
                });
            }
            
            if (checkedCount === tables.length) {
                setTimeout(() => {
                    console.log('\n' + '='.repeat(80));
                    console.log('检查完成！');
                    db.end();
                }, 500);
            }
        });
    });
});
