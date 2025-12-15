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
    console.log('检查 customer_accounts 表数据...\n');
    
    // 先查看表结构
    db.query('DESCRIBE customer_accounts', (err, fields) => {
        if (err) {
            console.error('查询表结构失败:', err);
            db.end();
            return;
        }
        
        console.log('表结构:');
        console.log('字段名\t\t类型\t\t\tNULL\t键\t默认值');
        console.log('='.repeat(80));
        fields.forEach(field => {
            console.log(`${field.Field}\t\t${field.Type}\t\t${field.Null}\t${field.Key}\t${field.Default}`);
        });
        
        // 查询数据
        console.log('\n' + '='.repeat(80));
        console.log('表数据:');
        console.log('='.repeat(80));
        
        db.query('SELECT * FROM customer_accounts', (err, results) => {
            if (err) {
                console.error('查询数据失败:', err);
                db.end();
                return;
            }
            
            if (results.length === 0) {
                console.log('表中无数据');
                
                // 检查是否有客户数据
                console.log('\n检查 partners 表中的客户数据...');
                db.query('SELECT id, name, contact_person FROM partners WHERE type = "customer" LIMIT 5', (err, customers) => {
                    if (err) {
                        console.error('查询客户失败:', err);
                    } else {
                        console.log(`共有 ${customers.length} 个客户（仅显示前5个）:`);
                        customers.forEach(c => {
                            console.log(`  - ID: ${c.id}, 名称: ${c.name}, 联系人: ${c.contact_person}`);
                        });
                        
                        console.log('\n提示: customer_accounts 表为空，需要初始化客户账户数据');
                    }
                    db.end();
                });
            } else {
                console.log(`共 ${results.length} 条记录:\n`);
                results.forEach(row => {
                    console.log('ID:', row.id);
                    console.log('客户ID:', row.customer_id);
                    console.log('客户编号:', row.customer_code);
                    console.log('客户名称:', row.customer_name);
                    console.log('预付金额:', row.prepaid_amount);
                    console.log('消耗金额:', row.consumed_amount);
                    console.log('余额:', row.balance);
                    console.log('状态:', row.status);
                    console.log('-'.repeat(80));
                });
                db.end();
            }
        });
    });
});
