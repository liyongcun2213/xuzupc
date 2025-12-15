const mysql = require('mysql');
const fs = require('fs');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
});

connection.connect((err) => {
    if (err) {
        console.error('连接失败:', err);
        process.exit(1);
    }

    console.log('开始创建客户消费管理表...\n');

    const sql = fs.readFileSync('create-customer-billing-tables.sql', 'utf8');

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('创建表失败:', err);
            connection.end();
            process.exit(1);
        }

        console.log('✓ 数据库表创建成功！');
        console.log('✓ 客户账户表已初始化');
        
        // 查询初始化结果
        connection.query('SELECT COUNT(*) as count FROM customer_accounts', (err, result) => {
            if (!err && result[0]) {
                console.log(`✓ 已同步 ${result[0].count} 个客户账户\n`);
            }
            
            console.log('数据库结构：');
            console.log('1. customer_accounts - 客户账户表');
            console.log('2. payment_records - 缴费记录表');
            console.log('3. daily_charge_records - 每日扣费记录表');
            console.log('4. customer_transaction_details - 客户消费明细表');
            
            connection.end();
        });
    });
});
