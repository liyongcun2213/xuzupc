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
    console.log('测试客户消费列表查询...\n');
    
    // 使用修复后的查询语句
    const sql = `
        SELECT 
            ca.id,
            ca.customer_id,
            ca.customer_code,
            ca.customer_name,
            ca.prepaid_amount,
            ca.consumed_amount,
            ca.balance,
            ca.status,
            ca.updated_at,
            COUNT(DISTINCT ro.id) as rental_count
        FROM customer_accounts ca
        LEFT JOIN rental_orders ro ON ca.customer_id = ro.customer_id AND ro.status IN ('renting', 'active')
        WHERE 1=1
        GROUP BY ca.id ORDER BY ca.updated_at DESC
    `;
    
    console.log('执行查询...');
    db.query(sql, [], (err, results) => {
        if (err) {
            console.error('❌ 查询失败:', err);
            console.error('错误详情:', err.message);
            console.error('SQL状态:', err.sqlState);
            console.error('错误代码:', err.code);
        } else {
            console.log(`✅ 查询成功！返回 ${results.length} 条记录\n`);
            
            if (results.length > 0) {
                console.log('前3条数据示例:');
                console.log('='.repeat(100));
                results.slice(0, 3).forEach((row, index) => {
                    console.log(`记录 ${index + 1}:`);
                    console.log(`  客户编号: ${row.customer_code}`);
                    console.log(`  客户名称: ${row.customer_name}`);
                    console.log(`  余额: ¥${parseFloat(row.balance).toFixed(2)}`);
                    console.log(`  状态: ${row.status}`);
                    console.log(`  租赁数量: ${row.rental_count}`);
                    console.log('-'.repeat(100));
                });
            }
        }
        
        db.end();
    });
});
