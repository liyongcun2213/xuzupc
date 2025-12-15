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
        process.exit(1);
    }
    console.log('已连接到数据库\n');

    // 测试搜索"二五八"
    const keyword = '二五八';
    const searchTerm = `%${keyword}%`;
    
    console.log('===== 测试1: 修复后的 autocomplete 查询 =====');
    const query1 = `
        SELECT 
            c.id, 
            COALESCE(ca.customer_code, '') as customer_code,
            c.name as value,
            CONCAT(COALESCE(ca.customer_code, ''), ' - ', c.name) as label
        FROM customers c
        LEFT JOIN customer_accounts ca ON c.id = ca.customer_id
        WHERE ca.customer_code LIKE ? OR c.name LIKE ? OR c.contact_person LIKE ?
        GROUP BY c.id, ca.customer_code, c.name
        ORDER BY ca.customer_code
        LIMIT 10
    `;
    
    db.query(query1, [searchTerm, searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error('查询失败:', err);
        } else {
            console.log(`搜索关键字: "${keyword}"`);
            console.log('查询结果数量:', results.length);
            if (results.length > 0) {
                console.log('查询结果:');
                results.forEach(r => {
                    console.log(`  - ID: ${r.id}, 编号: ${r.customer_code}, 名称: ${r.value}, 显示: ${r.label}`);
                });
            } else {
                console.log('未找到匹配结果');
            }
        }
        
        console.log('\n===== 测试2: 检查所有包含"二五八"的客户 =====');
        const query2 = `
            SELECT id, name, contact_person
            FROM customers
            WHERE name LIKE ? OR contact_person LIKE ?
        `;
        
        db.query(query2, [searchTerm, searchTerm], (err, results) => {
            if (err) {
                console.error('查询失败:', err);
            } else {
                console.log('customers 表中匹配的记录:', results.length);
                results.forEach(r => {
                    console.log(`  - ID: ${r.id}, 名称: ${r.name}, 联系人: ${r.contact_person}`);
                });
            }
            
            console.log('\n===== 测试3: 检查 customer_accounts 表的关联情况 =====');
            const query3 = `
                SELECT 
                    c.id,
                    c.name,
                    ca.customer_code,
                    ca.customer_id
                FROM customers c
                LEFT JOIN customer_accounts ca ON c.id = ca.customer_id
                WHERE c.name LIKE ? OR c.contact_person LIKE ?
            `;
            
            db.query(query3, [searchTerm, searchTerm], (err, results) => {
                if (err) {
                    console.error('查询失败:', err);
                } else {
                    console.log('关联查询结果:', results.length);
                    results.forEach(r => {
                        console.log(`  - 客户ID: ${r.id}, 名称: ${r.name}, 账户编号: ${r.customer_code || '无'}, 关联状态: ${r.customer_id ? '已关联' : '未关联'}`);
                    });
                }
                
                db.end();
                console.log('\n测试完成！');
            });
        });
    });
});
