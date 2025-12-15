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
    
    // 需要删除的重复记录ID（保留较旧的配置）
    const duplicateIds = [
        192,  // 内存 - 光威 32G (保留165的16G)
        193,  // 硬盘 - 威刚 1T (保留166的256G)
        196   // 电源 - 长城 525瓦 (保留169的425瓦)
    ];
    
    console.log('准备删除 PC0003 产品的以下重复配件配置:\n');
    
    // 先查询要删除的记录详情
    db.query(`
        SELECT id, product_code, accessory_name, brand, model, quantity
        FROM device_templates
        WHERE id IN (?)
    `, [duplicateIds], (err, rows) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log('ID\t配件名称\t\t品牌\t型号\t\t数量');
        console.log('================================================================');
        rows.forEach(row => {
            console.log(`${row.id}\t${row.accessory_name}\t\t${row.brand}\t${row.model}\t${row.quantity}`);
        });
        
        console.log('\n⚠️  将在3秒后自动删除这些记录...');
        console.log('⚠️  如果您不想删除，请立即按 Ctrl+C 终止程序\n');
        
        // 等待3秒后自动执行
        setTimeout(() => {
            console.log('开始删除...\n');
            
            db.query('DELETE FROM device_templates WHERE id IN (?)', [duplicateIds], (err, result) => {
                if (err) {
                    console.error('删除失败:', err);
                    db.end();
                    return;
                }
                
                console.log(`✓ 成功删除 ${result.affectedRows} 条重复记录\n`);
                
                // 验证删除结果
                db.query(`
                    SELECT 
                        dt.accessory_category_id,
                        ac.name AS category_name,
                        COUNT(*) as count
                    FROM device_templates dt
                    LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                    WHERE dt.product_code = 'PC0003'
                    GROUP BY dt.accessory_category_id, ac.name
                    HAVING COUNT(*) > 1
                `, (err, duplicates) => {
                    if (err) {
                        console.error('验证失败:', err);
                    } else if (duplicates.length > 0) {
                        console.log('⚠️  仍然存在重复配件:');
                        duplicates.forEach(d => {
                            console.log(`  - ${d.category_name}: ${d.count} 条记录`);
                        });
                    } else {
                        console.log('✓ PC0003 产品配置已无重复项');
                    }
                    
                    db.end();
                });
            });
        }, 3000);
    });
});
