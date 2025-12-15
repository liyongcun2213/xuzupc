const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

const customerId = 12; // 使用一个在 customer_accounts 中存在的客户ID

db.connect((err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        return;
    }
    
    console.log('数据库连接成功');
    console.log('测试客户消费详情查询, customerId =', customerId, '\n');
    
    // 1. 查询客户账户信息
    db.query('SELECT * FROM customer_accounts WHERE customer_id = ?', [customerId], (err, accountResult) => {
        if (err) {
            console.error('❌ 查询客户账户失败:', err);
            return db.end();
        }
        if (accountResult.length === 0) {
            console.log('❌ 客户账户不存在');
            return db.end();
        }
        const account = accountResult[0];
        console.log('✅ 客户账户查询成功，客户名称:', account.customer_name);
        
        // 2. 查询缴费记录
        db.query(
            'SELECT * FROM payment_records WHERE customer_id = ? ORDER BY payment_date DESC LIMIT 10',
            [customerId],
            (err, payments) => {
                if (err) {
                    console.error('❌ 查询缴费记录失败:', err);
                    return db.end();
                }
                console.log('✅ 缴费记录查询成功，条数:', payments.length);
                
                // 3. 查询消费明细
                db.query(
                    'SELECT * FROM customer_transaction_details WHERE customer_id = ? ORDER BY transaction_date DESC LIMIT 20',
                    [customerId],
                    (err, transactions) => {
                        if (err) {
                            console.error('❌ 查询消费明细失败:', err);
                            return db.end();
                        }
                        console.log('✅ 消费明细查询成功，条数:', transactions.length);
                        
                        // 4. 查询租赁信息（与接口中相同）
                        db.query(
                            `SELECT ro.* 
                             FROM rental_orders ro 
                             WHERE ro.customer_id = ? AND ro.status IN ('active')`,
                            [customerId],
                            (err, rentals) => {
                                if (err) {
                                    console.error('❌ 查询租赁信息失败:', err);
                                    return db.end();
                                }
                                console.log('✅ 租赁信息查询成功，条数:', rentals.length);
                                console.log('\n全部子查询执行成功，可以正常返回详情数据。');
                                db.end();
                            }
                        );
                    }
                );
            }
        );
    });
});
